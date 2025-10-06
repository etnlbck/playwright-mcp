import { getDatabase } from './config.js';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
  filename: string;
  content: string;
}

export class MigrationManager {
  private sql = getDatabase();

  async runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...');
    
    // Ensure migrations table exists
    await this.createMigrationsTable();
    
    // Get applied migrations
    const appliedMigrations = await this.getAppliedMigrations();
    
    // Get available migrations
    const availableMigrations = await this.getAvailableMigrations();
    
    // Filter out already applied migrations
    const pendingMigrations = availableMigrations.filter(
      migration => !appliedMigrations.has(migration.filename)
    );
    
    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }
    
    console.log(`📋 Found ${pendingMigrations.length} pending migrations`);
    
    // Apply each migration
    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }
    
    console.log('✅ All migrations completed successfully');
  }

  private async createMigrationsTable(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `;
  }

  private async getAppliedMigrations(): Promise<Set<string>> {
    try {
      const result = await this.sql`
        SELECT filename FROM migrations ORDER BY applied_at
      `;
      return new Set(result.map(row => row.filename));
    } catch (error) {
      console.warn('Could not fetch applied migrations:', error);
      return new Set();
    }
  }

  private async getAvailableMigrations(): Promise<Migration[]> {
    try {
      const migrationsDir = join(__dirname, 'migrations');
      const files = await readdir(migrationsDir);
      
      // Filter SQL files and sort by filename
      const sqlFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      const migrations: Migration[] = [];
      
      for (const filename of sqlFiles) {
        const filePath = join(migrationsDir, filename);
        const content = await readFile(filePath, 'utf-8');
        migrations.push({ filename, content });
      }
      
      return migrations;
    } catch (error) {
      console.error('Error reading migration files:', error);
      return [];
    }
  }

  private async applyMigration(migration: Migration): Promise<void> {
    console.log(`📝 Applying migration: ${migration.filename}`);
    
    try {
      // Run the migration SQL
      await this.sql.unsafe(migration.content);
      
      // Record the migration as applied
      await this.sql`
        INSERT INTO migrations (filename) VALUES (${migration.filename})
        ON CONFLICT (filename) DO NOTHING
      `;
      
      console.log(`✅ Applied migration: ${migration.filename}`);
    } catch (error) {
      console.error(`❌ Failed to apply migration ${migration.filename}:`, error);
      throw error;
    }
  }

  async getMigrationStatus(): Promise<{
    applied: string[];
    pending: string[];
  }> {
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.getAvailableMigrations();
    
    const applied = Array.from(appliedMigrations).sort();
    const pending = availableMigrations
      .filter(migration => !appliedMigrations.has(migration.filename))
      .map(migration => migration.filename)
      .sort();
    
    return { applied, pending };
  }
}

// CLI interface for running migrations
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new MigrationManager();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      manager.runMigrations()
        .then(() => process.exit(0))
        .catch(error => {
          console.error('Migration failed:', error);
          process.exit(1);
        });
      break;
      
    case 'status':
      manager.getMigrationStatus()
        .then(status => {
          console.log('📊 Migration Status:');
          console.log('Applied:', status.applied);
          console.log('Pending:', status.pending);
        })
        .catch(error => {
          console.error('Error getting migration status:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage:');
      console.log('  npm run migrate       - Run pending migrations');
      console.log('  npm run migrate:status - Show migration status');
      process.exit(1);
  }
}

