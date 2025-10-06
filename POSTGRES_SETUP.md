# PostgreSQL Setup for Playwright MCP Server

This guide will help you set up PostgreSQL as the datastore for the Playwright MCP Server's admin system.

## Quick Start with Docker

The easiest way to get started is using Docker Compose:

```bash
# Start PostgreSQL and pgAdmin
docker-compose up -d

# Run database migrations
npm run migrate

# Start the server
npm run dev
```

## Manual PostgreSQL Setup

### 1. Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE playwright_mcp;

# Create user (optional)
CREATE USER mcp_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE playwright_mcp TO mcp_user;

# Exit psql
\q
```

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=playwright_mcp
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# Server Configuration
PORT=3000
NODE_ENV=development

# Admin Token (generate a secure random string)
PLAYWRIGHT_ADMIN_TOKEN=your-secure-admin-token-here
```

### 4. Run Setup Script

```bash
# Make script executable
chmod +x setup-database.sh

# Run setup
./setup-database.sh
```

Or run migrations manually:

```bash
npm run migrate
```

## Database Schema

The system creates two main tables:

### `users` Table
- `id` (UUID, Primary Key)
- `email` (VARCHAR, Unique)
- `name` (VARCHAR)
- `role` (ENUM: admin, user, readonly)
- `is_active` (BOOLEAN)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)
- `last_login` (TIMESTAMP, Optional)

### `api_keys` Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key to users)
- `name` (VARCHAR)
- `key_hash` (VARCHAR, SHA-256 hash of the API key)
- `permissions` (TEXT[], Array of permission strings)
- `expires_at` (TIMESTAMP, Optional)
- `is_active` (BOOLEAN)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)
- `last_used` (TIMESTAMP, Optional)

## Migration System

The system includes a migration system for database schema management:

```bash
# Check migration status
npm run migrate:status

# Run pending migrations
npm run migrate
```

Migrations are stored in `src/database/migrations/` and are automatically applied when the server starts.

## Admin Dashboard

Once the database is set up:

1. Start the server: `npm run dev`
2. Access the admin dashboard at: `http://localhost:3000/admin`
3. Use the admin token shown in the server logs to log in
4. Create users and API keys through the web interface

## Troubleshooting

### Database Connection Issues

1. **Check PostgreSQL is running:**
   ```bash
   pg_isready -h localhost -p 5432 -U postgres
   ```

2. **Check database exists:**
   ```bash
   psql -U postgres -l | grep playwright_mcp
   ```

3. **Check environment variables:**
   ```bash
   echo $POSTGRES_HOST
   echo $POSTGRES_DB
   ```

### Migration Issues

1. **Reset migrations (CAUTION: This will delete all data):**
   ```bash
   # Connect to database
   psql -U postgres -d playwright_mcp
   
   # Drop all tables
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   
   # Exit and run migrations
   \q
   npm run migrate
   ```

### Permission Issues

Make sure the database user has the necessary permissions:

```sql
-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE playwright_mcp TO your_user;

-- Grant all privileges on the schema
GRANT ALL ON SCHEMA public TO your_user;

-- Grant all privileges on all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;

-- Grant all privileges on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

## Production Considerations

For production deployments:

1. **Use strong passwords and secure tokens**
2. **Enable SSL connections** (`POSTGRES_SSL=true`)
3. **Use connection pooling** (configure `POSTGRES_MAX_CONNECTIONS`)
4. **Set up regular backups**
5. **Monitor database performance**
6. **Use environment-specific configurations**

## pgAdmin Access

If using Docker Compose, pgAdmin is available at `http://localhost:8080`:
- Email: `admin@teamone.com`
- Password: `admin`

Add a server connection:
- Host: `postgres` (container name)
- Port: `5432`
- Database: `playwright_mcp`
- Username: `postgres`
- Password: `password`

