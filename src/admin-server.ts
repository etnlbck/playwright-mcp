import express from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuthManager, PERMISSIONS, ROLE_PERMISSIONS } from "./auth-manager.js";

const AdminTokenSchema = z.object({
  token: z.string().min(1)
});

const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["admin", "user", "readonly"]).default("user")
});

const CreateAPIKeyRequestSchema = z.object({
  userId: z.string(),
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

export class AdminServer {
  private app: express.Application;
  private authManager: AuthManager;

  constructor(authManager: AuthManager) {
    this.app = express();
    this.authManager = authManager;
    console.log('🛠️ AdminServer constructor called');
    this.setupMiddleware();
    this.setupRoutes();
    console.log('🛠️ AdminServer routes setup complete');
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for admin interface
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private async authenticateAdmin(req: Request, res: Response, next: () => void): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Admin token required' });
      return;
    }

    const token = authHeader.slice(7);
    const isValid = await this.authManager.authenticateAdminToken(token);
    
    if (!isValid) {
      res.status(401).json({ error: 'Invalid admin token' });
      return;
    }

    next();
  }

  private setupRoutes(): void {
    console.log('🛣️ Setting up admin server routes...');
    
    // Add request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`🔍 Admin server received: ${req.method} ${req.path}`);
      next();
    });
    
    // Add a simple test route
    this.app.get('/ping', (req: Request, res: Response) => {
      console.log('🔍 Ping endpoint hit');
      res.json({ message: 'pong' });
    });
    
    // Admin dashboard landing page
    this.app.get('/', (req: Request, res: Response) => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Playwright MCP Admin</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #333; margin-bottom: 30px; }
            .section { margin-bottom: 40px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 6px; }
            .section h2 { margin-top: 0; color: #555; }
            .btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px; }
            .btn:hover { background: #0056b3; }
            .btn-danger { background: #dc3545; }
            .btn-danger:hover { background: #c82333; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group input, .form-group select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            .table th { background-color: #f8f9fa; font-weight: bold; }
            .status-active { color: #28a745; font-weight: bold; }
            .status-inactive { color: #dc3545; font-weight: bold; }
            .api-key { font-family: monospace; background: #f8f9fa; padding: 4px 8px; border-radius: 3px; }
            .copy-btn { background: #6c757d; border: none; color: white; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 12px; }
            .copy-btn:hover { background: #545b62; }
            .alert { padding: 15px; margin-bottom: 20px; border-radius: 4px; }
            .alert-success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .alert-danger { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .hidden { display: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔐 Playwright MCP Admin Dashboard</h1>
            
            <div class="section">
              <h2>🔑 Authentication</h2>
              <div class="form-group">
                <label for="adminToken">Admin Token:</label>
                <input type="password" id="adminToken" placeholder="Enter admin token to access management features">
                <button class="btn" onclick="authenticate()">Authenticate</button>
              </div>
            </div>

            <div id="adminContent" class="hidden">
              <div class="section">
                <h2>👥 User Management</h2>
                <button class="btn" onclick="showCreateUserForm()">Create User</button>
                <div id="createUserForm" class="hidden">
                  <div class="form-group">
                    <label for="userEmail">Email:</label>
                    <input type="email" id="userEmail" required>
                  </div>
                  <div class="form-group">
                    <label for="userName">Name:</label>
                    <input type="text" id="userName" required>
                  </div>
                  <div class="form-group">
                    <label for="userRole">Role:</label>
                    <select id="userRole">
                      <option value="user">User</option>
                      <option value="readonly">Read Only</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button class="btn" onclick="createUser()">Create User</button>
                  <button class="btn" onclick="hideCreateUserForm()">Cancel</button>
                </div>
                <div id="usersTable"></div>
              </div>

              <div class="section">
                <h2>🔑 API Key Management</h2>
                <div class="form-group">
                  <label for="keyUserId">User:</label>
                  <select id="keyUserId"></select>
                </div>
                <div class="form-group">
                  <label for="keyName">Key Name:</label>
                  <input type="text" id="keyName" placeholder="e.g., 'Production API Key'">
                </div>
                <div class="form-group">
                  <label for="keyExpires">Expires in (days, optional):</label>
                  <input type="number" id="keyExpires" min="1" max="365" placeholder="Leave empty for no expiration">
                </div>
                <button class="btn" onclick="createAPIKey()">Generate API Key</button>
                <div id="apiKeysTable"></div>
              </div>

              <div class="section">
                <h2>📊 Statistics</h2>
                <div id="statsDisplay"></div>
              </div>
            </div>

            <div id="alerts"></div>
          </div>

          <script>
            let adminToken = '';
            let users = [];
            let apiKeys = [];

            async function authenticate() {
              const token = document.getElementById('adminToken').value;
              if (!token) {
                showAlert('Please enter an admin token', 'danger');
                return;
              }

              try {
                const response = await fetch('/admin/verify', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                  }
                });

                if (response.ok) {
                  adminToken = token;
                  document.getElementById('adminContent').classList.remove('hidden');
                  showAlert('Successfully authenticated', 'success');
                  loadData();
                } else {
                  showAlert('Invalid admin token', 'danger');
                }
              } catch (error) {
                showAlert('Authentication failed: ' + error.message, 'danger');
              }
            }

            async function loadData() {
              await loadUsers();
              await loadAPIKeys();
              await loadStats();
            }

            async function loadUsers() {
              try {
                const response = await fetch('/admin/users', {
                  headers: { 'Authorization': 'Bearer ' + adminToken }
                });
                users = await response.json();
                renderUsersTable();
                updateUserSelect();
              } catch (error) {
                showAlert('Failed to load users: ' + error.message, 'danger');
              }
            }

            async function loadAPIKeys() {
              try {
                const response = await fetch('/admin/api-keys', {
                  headers: { 'Authorization': 'Bearer ' + adminToken }
                });
                apiKeys = await response.json();
                renderAPIKeysTable();
              } catch (error) {
                showAlert('Failed to load API keys: ' + error.message, 'danger');
              }
            }

            async function loadStats() {
              try {
                const response = await fetch('/admin/stats', {
                  headers: { 'Authorization': 'Bearer ' + adminToken }
                });
                const stats = await response.json();
                renderStats(stats);
              } catch (error) {
                showAlert('Failed to load stats: ' + error.message, 'danger');
              }
            }

            function renderUsersTable() {
              const table = document.getElementById('usersTable');
              table.innerHTML = \`
                <table class="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    \${users.map(user => \`
                      <tr>
                        <td>\${user.name}</td>
                        <td>\${user.email}</td>
                        <td>\${user.role}</td>
                        <td class="\${user.isActive ? 'status-active' : 'status-inactive'}">
                          \${user.isActive ? 'Active' : 'Inactive'}
                        </td>
                        <td>\${new Date(user.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button class="btn btn-danger" onclick="toggleUserStatus('\${user.id}')">
                            \${user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    \`).join('')}
                  </tbody>
                </table>
              \`;
            }

            function renderAPIKeysTable() {
              const table = document.getElementById('apiKeysTable');
              table.innerHTML = \`
                <table class="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>User</th>
                      <th>API Key</th>
                      <th>Status</th>
                      <th>Usage</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    \${apiKeys.map(key => {
                      const user = users.find(u => u.id === key.userId);
                      return \`
                        <tr>
                          <td>\${key.name}</td>
                          <td>\${user ? user.name : 'Unknown'}</td>
                          <td>
                            <span class="api-key">\${key.keyHash.substring(0, 8)}...</span>
                            <button class="copy-btn" onclick="copyToClipboard('\${key.keyHash}')">Copy</button>
                          </td>
                          <td class="\${key.isActive ? 'status-active' : 'status-inactive'}">
                            \${key.isActive ? 'Active' : 'Inactive'}
                          </td>
                          <td>\${key.usageCount}</td>
                          <td>\${new Date(key.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button class="btn btn-danger" onclick="revokeAPIKey('\${key.id}')">Revoke</button>
                          </td>
                        </tr>
                      \`;
                    }).join('')}
                  </tbody>
                </table>
              \`;
            }

            function renderStats(stats) {
              const statsDiv = document.getElementById('statsDisplay');
              statsDiv.innerHTML = \`
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                  <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px;">
                    <h3>\${stats.totalUsers}</h3>
                    <p>Total Users</p>
                  </div>
                  <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px;">
                    <h3>\${stats.activeUsers}</h3>
                    <p>Active Users</p>
                  </div>
                  <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px;">
                    <h3>\${stats.totalAPIKeys}</h3>
                    <p>Total API Keys</p>
                  </div>
                  <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px;">
                    <h3>\${stats.activeAPIKeys}</h3>
                    <p>Active API Keys</p>
                  </div>
                  <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px;">
                    <h3>\${stats.totalUsage}</h3>
                    <p>Total API Usage</p>
                  </div>
                </div>
              \`;
            }

            function updateUserSelect() {
              const select = document.getElementById('keyUserId');
              select.innerHTML = users.map(user => 
                \`<option value="\${user.id}">\${user.name} (\${user.email})</option>\`
              ).join('');
            }

            async function createUser() {
              const email = document.getElementById('userEmail').value;
              const name = document.getElementById('userName').value;
              const role = document.getElementById('userRole').value;

              if (!email || !name) {
                showAlert('Please fill in all required fields', 'danger');
                return;
              }

              try {
                const response = await fetch('/admin/users', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + adminToken,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ email, name, role })
                });

                if (response.ok) {
                  showAlert('User created successfully', 'success');
                  hideCreateUserForm();
                  loadUsers();
                } else {
                  const error = await response.json();
                  showAlert('Failed to create user: ' + error.error, 'danger');
                }
              } catch (error) {
                showAlert('Failed to create user: ' + error.message, 'danger');
              }
            }

            async function createAPIKey() {
              const userId = document.getElementById('keyUserId').value;
              const name = document.getElementById('keyName').value;
              const expiresInDays = document.getElementById('keyExpires').value;

              if (!userId || !name) {
                showAlert('Please select a user and enter a key name', 'danger');
                return;
              }

              try {
                const body = { userId, name };
                if (expiresInDays) body.expiresInDays = parseInt(expiresInDays);

                const response = await fetch('/admin/api-keys', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + adminToken,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(body)
                });

                if (response.ok) {
                  const result = await response.json();
                  showAlert(\`API Key created: \${result.key}\`, 'success');
                  document.getElementById('keyName').value = '';
                  document.getElementById('keyExpires').value = '';
                  loadAPIKeys();
                } else {
                  const error = await response.json();
                  showAlert('Failed to create API key: ' + error.error, 'danger');
                }
              } catch (error) {
                showAlert('Failed to create API key: ' + error.message, 'danger');
              }
            }

            async function toggleUserStatus(userId) {
              try {
                const response = await fetch(\`/admin/users/\${userId}\`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': 'Bearer ' + adminToken,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ isActive: !users.find(u => u.id === userId).isActive })
                });

                if (response.ok) {
                  showAlert('User status updated', 'success');
                  loadUsers();
                } else {
                  const error = await response.json();
                  showAlert('Failed to update user: ' + error.error, 'danger');
                }
              } catch (error) {
                showAlert('Failed to update user: ' + error.message, 'danger');
              }
            }

            async function revokeAPIKey(keyId) {
              if (!confirm('Are you sure you want to revoke this API key?')) return;

              try {
                const response = await fetch(\`/admin/api-keys/\${keyId}\`, {
                  method: 'DELETE',
                  headers: { 'Authorization': 'Bearer ' + adminToken }
                });

                if (response.ok) {
                  showAlert('API key revoked', 'success');
                  loadAPIKeys();
                } else {
                  const error = await response.json();
                  showAlert('Failed to revoke API key: ' + error.error, 'danger');
                }
              } catch (error) {
                showAlert('Failed to revoke API key: ' + error.message, 'danger');
              }
            }

            function showCreateUserForm() {
              document.getElementById('createUserForm').classList.remove('hidden');
            }

            function hideCreateUserForm() {
              document.getElementById('createUserForm').classList.add('hidden');
            }

            function showAlert(message, type) {
              const alertsDiv = document.getElementById('alerts');
              const alert = document.createElement('div');
              alert.className = \`alert alert-\${type}\`;
              alert.textContent = message;
              alertsDiv.appendChild(alert);
              setTimeout(() => alert.remove(), 5000);
            }

            function copyToClipboard(text) {
              navigator.clipboard.writeText(text).then(() => {
                showAlert('Copied to clipboard', 'success');
              }).catch(() => {
                showAlert('Failed to copy to clipboard', 'danger');
              });
            }
          </script>
        </body>
        </html>
      `;
      res.send(html);
    });

    // Test endpoint
    this.app.get('/test', (req: Request, res: Response) => {
      console.log('🔍 GET /test endpoint hit');
      res.json({ message: 'Admin server is working' });
    });

    // Admin authentication verification (no auth required for this endpoint)
    console.log('🛣️ Registering POST /verify route');
    this.app.post('/verify', (req: Request, res: Response) => {
      console.log('🔍 POST /verify endpoint hit');
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'No authorization header' });
      }
      
      const token = authHeader.substring(7);
      console.log(`🔍 Verifying admin token: ${token.substring(0, 8)}...`);
      const isValid = this.authManager.authenticateAdminToken(token);
      console.log(`🔍 Token validation result: ${isValid}`);
      
      if (isValid) {
        res.json({ success: true, message: 'Admin authenticated' });
      } else {
        res.status(401).json({ success: false, error: 'Invalid admin token' });
      }
    });

    // User management endpoints
    this.app.get('/admin/users', this.authenticateAdmin.bind(this), async (req: Request, res: Response) => {
      try {
        const users = await this.authManager.listUsers();
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.app.post('/admin/users', this.authenticateAdmin.bind(this), async (req: Request, res: Response) => {
      try {
        const userData = CreateUserRequestSchema.parse(req.body);
        const user = await this.authManager.createUser(userData);
        res.json(user);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'Invalid user data', details: error.errors });
        } else {
          res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    });

    this.app.put('/admin/users/:userId', this.authenticateAdmin.bind(this), async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const updates = UpdateUserRequestSchema.parse(req.body);
        const user = await this.authManager.updateUser(userId, updates);
        
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }
        
        res.json(user);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'Invalid update data', details: error.errors });
        } else {
          res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    });

    // API key management endpoints
    this.app.get('/admin/api-keys', this.authenticateAdmin.bind(this), async (req: Request, res: Response) => {
      try {
        const apiKeys = await this.authManager.listAPIKeys();
        res.json(apiKeys);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.app.post('/admin/api-keys', this.authenticateAdmin.bind(this), async (req: Request, res: Response) => {
      try {
        const keyData = CreateAPIKeyRequestSchema.parse(req.body);
        
        // Extract admin user ID from token (for audit purposes)
        const adminUserId = 'system'; // In a real implementation, you'd extract this from the token
        
        const result = await this.authManager.createAPIKey(keyData.userId, {
          name: keyData.name,
          permissions: keyData.permissions,
          expiresInDays: keyData.expiresInDays
        }, adminUserId);
        
        res.json(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'Invalid API key data', details: error.errors });
        } else {
          res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    });

    this.app.delete('/admin/api-keys/:keyId', this.authenticateAdmin.bind(this), async (req: Request, res: Response) => {
      try {
        const { keyId } = req.params;
        const adminUserId = 'system'; // In a real implementation, you'd extract this from the token
        
        const success = await this.authManager.revokeAPIKey(keyId, adminUserId);
        
        if (!success) {
          res.status(404).json({ error: 'API key not found' });
          return;
        }
        
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Statistics endpoint
    this.app.get('/admin/stats', this.authenticateAdmin.bind(this), async (req: Request, res: Response) => {
      try {
        const stats = await this.authManager.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Permissions reference endpoint
    this.app.get('/admin/permissions', this.authenticateAdmin.bind(this), (req: Request, res: Response) => {
      res.json({
        permissions: PERMISSIONS,
        rolePermissions: ROLE_PERMISSIONS
      });
    });
  }

  getApp(): express.Application {
    return this.app;
  }
}