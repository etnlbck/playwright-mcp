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
if [ -d "/home/playwright/.cache/ms-playwright" ]; then
    echo "  ✅ Playwright cache found"
    ls -la /home/playwright/.cache/ms-playwright/ || echo "  ❌ Cannot list cache"
else
    echo "  ❌ Playwright cache not found"
fi

echo "🎭 Starting application..."
exec node dist/index.js
