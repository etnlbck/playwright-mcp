import postgres from 'postgres';

// Database configuration interface
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean | object;
  max?: number;
  idle_timeout?: number;
  max_lifetime?: number;
  connect_timeout?: number;
}

// Get database configuration from environment variables
export function getDatabaseConfig(): DatabaseConfig {
  const config: DatabaseConfig = {
    host: process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || process.env.PGPORT || '5432'),
    database: process.env.POSTGRES_DB || process.env.PGDATABASE || 'playwright_mcp',
    username: process.env.POSTGRES_USER || process.env.PGUSER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'password',
    ssl: process.env.POSTGRES_SSL === 'true' ? true : false,
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '10'),
    idle_timeout: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '20'),
    max_lifetime: parseInt(process.env.POSTGRES_MAX_LIFETIME || '1800'),
    connect_timeout: parseInt(process.env.POSTGRES_CONNECT_TIMEOUT || '30'),
  };

  return config;
}

// Create database connection
let sqlInstance: ReturnType<typeof postgres> | null = null;

export function getDatabase() {
  if (!sqlInstance) {
    const config = getDatabaseConfig();
    
    console.log('🔌 Connecting to PostgreSQL database:', {
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      ssl: config.ssl,
      max: config.max,
    });

    sqlInstance = postgres({
      ...config,
      transform: {
        ...postgres.camel, // Convert snake_case to camelCase
        undefined: null,   // Transform undefined to null
      },
      onnotice: process.env.NODE_ENV === 'development' ? console.log : false,
      debug: process.env.NODE_ENV === 'development' ? console.log : false,
    });
  }

  return sqlInstance;
}

// Close database connection
export async function closeDatabase() {
  if (sqlInstance) {
    console.log('🔌 Closing PostgreSQL connection...');
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = null;
  }
}

// Test database connection
export async function testDatabaseConnection() {
  try {
    const sql = getDatabase();
    const result = await sql`SELECT version() as version, NOW() as current_time`;
    console.log('✅ Database connection successful:', result[0]);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Initialize database with schema using migrations
export async function initializeDatabase() {
  try {
    const { MigrationManager } = await import('./migrate.js');
    const migrationManager = new MigrationManager();
    
    console.log('📋 Running database migrations...');
    await migrationManager.runMigrations();
    
    console.log('✅ Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
}

// Graceful shutdown handler
export function setupGracefulShutdown() {
  const gracefulShutdown = async () => {
    console.log('🛑 Gracefully shutting down database connection...');
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGUSR2', gracefulShutdown); // nodemon restart
}
