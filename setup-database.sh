#!/bin/bash

# Setup script for PostgreSQL database
# This script creates the database and runs migrations

set -e

echo "🚀 Setting up PostgreSQL database for Playwright MCP Server..."

# Default database configuration
DB_HOST=${POSTGRES_HOST:-localhost}
DB_PORT=${POSTGRES_PORT:-5432}
DB_NAME=${POSTGRES_DB:-playwright_mcp}
DB_USER=${POSTGRES_USER:-postgres}
DB_PASSWORD=${POSTGRES_PASSWORD:-password}

echo "📋 Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"

# Check if PostgreSQL is running
echo "🔍 Checking if PostgreSQL is running..."
if ! pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; then
    echo "❌ PostgreSQL is not running or not accessible"
    echo "Please ensure PostgreSQL is installed and running:"
    echo "  - macOS: brew install postgresql && brew services start postgresql"
    echo "  - Ubuntu: sudo apt install postgresql postgresql-contrib && sudo systemctl start postgresql"
    echo "  - Docker: docker run --name postgres -e POSTGRES_PASSWORD=$DB_PASSWORD -p $DB_PORT:5432 -d postgres:15"
    exit 1
fi

echo "✅ PostgreSQL is running"

# Create database if it doesn't exist
echo "📦 Creating database '$DB_NAME' if it doesn't exist..."
PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME 2>/dev/null || echo "Database already exists"

echo "✅ Database '$DB_NAME' is ready"

# Set environment variables for the application
export POSTGRES_HOST=$DB_HOST
export POSTGRES_PORT=$DB_PORT
export POSTGRES_DB=$DB_NAME
export POSTGRES_USER=$DB_USER
export POSTGRES_PASSWORD=$DB_PASSWORD

# Run migrations
echo "🔄 Running database migrations..."
npm run migrate

echo "🎉 Database setup completed successfully!"
echo ""
echo "📝 Next steps:"
echo "  1. Start the server: npm run dev"
echo "  2. Access admin dashboard at: http://localhost:3000/admin"
echo "  3. Use the admin token shown in the server logs"
echo ""
echo "🔧 Environment variables are set for this session."
echo "   For permanent setup, add them to your .env file:"
echo "   POSTGRES_HOST=$DB_HOST"
echo "   POSTGRES_PORT=$DB_PORT"
echo "   POSTGRES_DB=$DB_NAME"
echo "   POSTGRES_USER=$DB_USER"
echo "   POSTGRES_PASSWORD=$DB_PASSWORD"

