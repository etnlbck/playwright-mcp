import crypto from "crypto";
import { z } from "zod";
import { getDatabase } from './database/config';
import type { PostgresJsDatabase } from 'postgres';

// User and API key schemas
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "user", "readonly"]),
  createdAt: z.date(),
  lastLogin: z.date().optional(),
  isActive: z.boolean().default(true)
});

const APIKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  keyHash: z.string(), // SHA-256 hash of the actual key
  permissions: z.array(z.string()), // Array of permission strings
  createdAt: z.date(),
  lastUsed: z.date().optional(),
  expiresAt: z.date().optional(),
  isActive: z.boolean().default(true),
  usageCount: z.number().default(0)
});

const CreateAPIKeyRequestSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).optional(),
  expiresInDays: z.number().min(1).max(365).optional()
});

const UpdateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  role: z.enum(["admin", "user", "readonly"]).optional(),
  isActive: z.boolean().optional()
});

type User = z.infer<typeof UserSchema>;
type APIKey = z.infer<typeof APIKeySchema>;
type CreateAPIKeyRequest = z.infer<typeof CreateAPIKeyRequestSchema>;
type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

// Permission definitions
export const PERMISSIONS = {
  // Tool permissions
  NAVIGATE: "tools:navigate",
  SCREENSHOT: "tools:screenshot", 
  SCRAPE: "tools:scrape",
  CLICK: "tools:click",
  TYPE: "tools:type",
  WAIT_FOR: "tools:wait_for",
  GET_URL: "tools:get_url",
  CLOSE_BROWSER: "tools:close_browser",
  BROWSER_HEALTH: "tools:browser_health",
  ASSERT_TEMPLATE: "tools:assert_template",
  
  // Admin permissions
  MANAGE_USERS: "admin:manage_users",
  MANAGE_API_KEYS: "admin:manage_api_keys",
  VIEW_LOGS: "admin:view_logs",
  SYSTEM_CONFIG: "admin:system_config"
} as const;

// Default role permissions
export const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),
  user: [
    PERMISSIONS.NAVIGATE,
    PERMISSIONS.SCREENSHOT,
    PERMISSIONS.SCRAPE,
    PERMISSIONS.CLICK,
    PERMISSIONS.TYPE,
    PERMISSIONS.WAIT_FOR,
    PERMISSIONS.GET_URL,
    PERMISSIONS.BROWSER_HEALTH,
    PERMISSIONS.ASSERT_TEMPLATE
  ],
  readonly: [
    PERMISSIONS.GET_URL,
    PERMISSIONS.BROWSER_HEALTH,
    PERMISSIONS.SCREENSHOT,
    PERMISSIONS.SCRAPE
  ]
} as const;

export class AuthManager {
  private sql: PostgresJsDatabase;
  private adminToken: string;
  private initialized = false;

  constructor(adminToken?: string) {
    this.sql = getDatabase();
    this.adminToken = adminToken || process.env["PLAYWRIGHT_ADMIN_TOKEN"] || this.generateSecureToken();
    console.log(`🔐 AuthManager initialized with admin token: ${this.adminToken.substring(0, 8)}...`);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Check if admin user exists, if not create one
    const adminUser = await this.getUserByEmail("nate.lubeck@teamone-usa.com");
    if (!adminUser) {
      const newAdminUser = await this.createUser({
        email: "nate.lubeck@teamone-usa.com",
        name: "System Administrator",
        role: "admin"
      });
      console.log(`👤 Created default admin user: ${newAdminUser.email}`);
    }
    
    this.initialized = true;
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateAPIKey(): string {
    // Generate a readable API key: prefix-xxxxxxxx-xxxxxxxx-xxxxxxxx
    const prefix = "pwmcp";
    const segments = Array.from({ length: 3 }, () => 
      crypto.randomBytes(4).toString('hex')
    );
    return `${prefix}-${segments.join('-')}`;
  }

  private hashAPIKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  // User management
  async createUser(userData: { email: string; name: string; role?: "admin" | "user" | "readonly"; isActive?: boolean }): Promise<User> {
    try {
      const result = await this.sql`
        INSERT INTO users (email, name, role, is_active)
        VALUES (${userData.email}, ${userData.name}, ${userData.role || 'user'}, ${userData.isActive ?? true})
        RETURNING *
      `;
      
      const user = result[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      };
    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('User with this email already exists');
      }
      throw error;
    }
  }

  async getUser(userId: string): Promise<User | null> {
    try {
      const result = await this.sql`
        SELECT * FROM users WHERE id = ${userId}
      `;
      
      if (result.length === 0) return null;
      
      const user = result[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      };
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await this.sql`
        SELECT * FROM users WHERE email = ${email}
      `;
      
      if (result.length === 0) return null;
      
      const user = result[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      };
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  async updateUser(userId: string, updates: UpdateUserRequest): Promise<User | null> {
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCount = 1;

      if (updates.email !== undefined) {
        updateFields.push(`email = $${paramCount++}`);
        updateValues.push(updates.email);
      }
      if (updates.name !== undefined) {
        updateFields.push(`name = $${paramCount++}`);
        updateValues.push(updates.name);
      }
      if (updates.role !== undefined) {
        updateFields.push(`role = $${paramCount++}`);
        updateValues.push(updates.role);
      }
      if (updates.isActive !== undefined) {
        updateFields.push(`is_active = $${paramCount++}`);
        updateValues.push(updates.isActive);
      }

      if (updateFields.length === 0) {
        return this.getUser(userId);
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(userId);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await this.sql.unsafe(query, updateValues);
      
      if (result.length === 0) return null;
      
      const user = result[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      };
    } catch (error) {
      console.error('Error updating user:', error);
      return null;
    }
  }

  async listUsers(): Promise<User[]> {
    try {
      const result = await this.sql`
        SELECT * FROM users ORDER BY created_at DESC
      `;
      
      return result.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      }));
    } catch (error) {
      console.error('Error listing users:', error);
      return [];
    }
  }

  // API Key management
  async createAPIKey(userId: string, request: CreateAPIKeyRequest, creatorUserId: string): Promise<{ key: string; apiKey: APIKey }> {
    try {
      // Get user to determine permissions
      const user = await this.getUser(userId);
      if (!user) throw new Error("User not found");
      if (!user.isActive) throw new Error("User is inactive");

      // Get creator user to check permissions
      const creatorUser = await this.getUser(creatorUserId);
      if (!creatorUser) throw new Error("Creator user not found");

      const key = this.generateAPIKey();
      const keyHash = this.hashAPIKey(key);
      
      // Determine permissions based on user role and explicit permissions
      let permissions: string[];
      if (request.permissions) {
        // Validate that creator has permission to grant these permissions
        if (creatorUser.role !== "admin") {
          throw new Error("Only admins can specify custom permissions");
        }
        permissions = [...request.permissions];
      } else {
        permissions = [...ROLE_PERMISSIONS[user.role]];
      }

      const expiresAt = request.expiresInDays 
        ? new Date(Date.now() + request.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const result = await this.sql`
        INSERT INTO api_keys (user_id, name, key_hash, permissions, expires_at, is_active)
        VALUES (${userId}, ${request.name}, ${keyHash}, ${permissions}, ${expiresAt}, true)
        RETURNING *
      `;

      const apiKey = result[0];
      return {
        key,
        apiKey: {
          id: apiKey.id,
          userId: apiKey.userId,
          name: apiKey.name,
          keyHash: apiKey.keyHash,
          permissions: apiKey.permissions,
          createdAt: apiKey.createdAt,
          lastUsed: apiKey.lastUsed,
          expiresAt: apiKey.expiresAt,
          isActive: apiKey.isActive,
          usageCount: 0 // We'll track this separately if needed
        }
      };
    } catch (error) {
      console.error('Error creating API key:', error);
      throw error;
    }
  }

  async getAPIKey(keyId: string): Promise<APIKey | null> {
    try {
      const result = await this.sql`
        SELECT * FROM api_keys WHERE id = ${keyId}
      `;
      
      if (result.length === 0) return null;
      
      const apiKey = result[0];
      return {
        id: apiKey.id,
        userId: apiKey.userId,
        name: apiKey.name,
        keyHash: apiKey.keyHash,
        permissions: apiKey.permissions,
        createdAt: apiKey.createdAt,
        lastUsed: apiKey.lastUsed,
        expiresAt: apiKey.expiresAt,
        isActive: apiKey.isActive,
        usageCount: 0
      };
    } catch (error) {
      console.error('Error getting API key:', error);
      return null;
    }
  }

  async listAPIKeys(userId?: string): Promise<APIKey[]> {
    try {
      let result;
      if (userId) {
        result = await this.sql`
          SELECT * FROM api_keys WHERE user_id = ${userId} ORDER BY created_at DESC
        `;
      } else {
        result = await this.sql`
          SELECT * FROM api_keys ORDER BY created_at DESC
        `;
      }
      
      return result.map(apiKey => ({
        id: apiKey.id,
        userId: apiKey.userId,
        name: apiKey.name,
        keyHash: apiKey.keyHash,
        permissions: apiKey.permissions,
        createdAt: apiKey.createdAt,
        lastUsed: apiKey.lastUsed,
        expiresAt: apiKey.expiresAt,
        isActive: apiKey.isActive,
        usageCount: 0
      }));
    } catch (error) {
      console.error('Error listing API keys:', error);
      return [];
    }
  }

  async revokeAPIKey(keyId: string, revokerUserId: string): Promise<boolean> {
    try {
      const apiKey = await this.getAPIKey(keyId);
      if (!apiKey) return false;

      const revokerUser = await this.getUser(revokerUserId);
      if (!revokerUser) return false;

      // Users can revoke their own keys, admins can revoke any key
      if (revokerUser.role !== "admin" && apiKey.userId !== revokerUserId) {
        throw new Error("Insufficient permissions to revoke this API key");
      }

      await this.sql`
        UPDATE api_keys 
        SET is_active = false, updated_at = NOW()
        WHERE id = ${keyId}
      `;
      
      return true;
    } catch (error) {
      console.error('Error revoking API key:', error);
      return false;
    }
  }

  // Authentication
  async authenticateAPIKey(token: string): Promise<{ user: User; apiKey: APIKey } | null> {
    try {
      const keyHash = this.hashAPIKey(token);
      
      const result = await this.sql`
        SELECT 
          ak.*,
          u.email as user_email,
          u.name as user_name,
          u.role as user_role,
          u.created_at as user_created_at,
          u.last_login as user_last_login,
          u.is_active as user_is_active
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = ${keyHash}
          AND ak.is_active = true
          AND u.is_active = true
          AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
      `;
      
      if (result.length === 0) return null;
      
      const row = result[0];
      
      const user: User = {
        id: row.userId,
        email: row.user_email,
        name: row.user_name,
        role: row.user_role,
        createdAt: row.user_created_at,
        lastLogin: row.user_last_login,
        isActive: row.user_is_active
      };
      
      const apiKey: APIKey = {
        id: row.id,
        userId: row.userId,
        name: row.name,
        keyHash: row.keyHash,
        permissions: row.permissions,
        createdAt: row.createdAt,
        lastUsed: row.lastUsed,
        expiresAt: row.expiresAt,
        isActive: row.isActive,
        usageCount: 0
      };

      // Update last used timestamp
      await this.sql`
        UPDATE api_keys 
        SET last_used = NOW(), updated_at = NOW()
        WHERE id = ${apiKey.id}
      `;

      return { user, apiKey };
    } catch (error) {
      console.error('Error authenticating API key:', error);
      return null;
    }
  }

  async authenticateAdminToken(token: string): Promise<boolean> {
    console.log(`🔍 Comparing tokens: ${token.substring(0, 8)}... vs ${this.adminToken.substring(0, 8)}...`);
    const result = this.constantTimeCompare(token, this.adminToken);
    console.log(`🔍 Token comparison result: ${result}`);
    return result;
  }

  // Permission checking
  hasPermission(permissions: string[], requiredPermission: string): boolean {
    return permissions.includes(requiredPermission) || permissions.includes(PERMISSIONS.MANAGE_API_KEYS);
  }

  async checkToolPermission(token: string, toolName: string): Promise<boolean> {
    const auth = await this.authenticateAPIKey(token);
    if (!auth) return false;

    const requiredPermission = `tools:${toolName}`;
    return this.hasPermission(auth.apiKey.permissions, requiredPermission);
  }

  // Admin token for initial setup
  getAdminToken(): string {
    return this.adminToken;
  }

  // Statistics
  async getStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalAPIKeys: number;
    activeAPIKeys: number;
    totalUsage: number;
  }> {
    try {
      const [userStats, apiKeyStats] = await Promise.all([
        this.sql`
          SELECT 
            COUNT(*) as total_users,
            COUNT(*) FILTER (WHERE is_active = true) as active_users
          FROM users
        `,
        this.sql`
          SELECT 
            COUNT(*) as total_api_keys,
            COUNT(*) FILTER (WHERE is_active = true) as active_api_keys
          FROM api_keys
        `
      ]);
      
      return {
        totalUsers: parseInt(userStats[0].total_users),
        activeUsers: parseInt(userStats[0].active_users),
        totalAPIKeys: parseInt(apiKeyStats[0].total_api_keys),
        activeAPIKeys: parseInt(apiKeyStats[0].active_api_keys),
        totalUsage: 0 // We can implement usage tracking later if needed
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        totalAPIKeys: 0,
        activeAPIKeys: 0,
        totalUsage: 0
      };
    }
  }
}

export { User, APIKey, CreateAPIKeyRequest, UpdateUserRequest };