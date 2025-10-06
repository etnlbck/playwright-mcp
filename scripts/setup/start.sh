#!/bin/bash
set -e

echo "🚀 Starting Playwright MCP Server..."
echo "Environment variables:"
echo "  NODE_ENV: ${NODE_ENV:-not set}"
echo "  MODE: ${MODE:-not set}"
echo "  PORT: ${PORT:-not set}"
echo "  PWD: $(pwd)"
echo "  USER: $(whoami)"

echo "📁 Directory contents:"
ls -la

echo "🔍 Node modules check:"
ls -la node_modules/.bin/ | head -10

echo "📦 Playwright installation check:"
if [ -d "/ms-playwright" ]; then
    echo "  ✅ Playwright browsers found in /ms-playwright"
    ls -la /ms-playwright/ || echo "  ❌ Cannot list browsers"
elif [ -d "/home/playwright/.cache/ms-playwright" ]; then
    echo "  ✅ Playwright cache found"
    ls -la /home/playwright/.cache/ms-playwright/ || echo "  ❌ Cannot list cache"
else
    echo "  ❌ Playwright browsers not found"
    echo "  Attempting to install browsers..."
    npx playwright install chromium --with-deps || echo "  ❌ Failed to install browsers"
fi

echo "🎭 Starting application..."
exec node dist/index.js
