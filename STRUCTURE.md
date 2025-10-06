# Project Structure Overview

## 🏗️ New Organized Structure

The project has been restructured for better organization and maintainability:

```markdown
playwrightMCP/
├── 📁 src/                          # Source code
│   ├── 📁 core/                     # Core server functionality
│   │   ├── index.ts                 # Main server entry point & startServer function
│   │   ├── server.ts                # PlaywrightMCPServer class
│   │   └── mcp-http-server.ts       # HTTP MCP server implementation
│   ├── 📁 adapters/                 # Server adapters & integrations
│   │   ├── http-mcp-adapter.ts      # HTTP MCP adapter
│   │   ├── http-server.ts           # Basic HTTP server
│   │   ├── minimal-server.ts        # Minimal server implementation
│   │   └── railway-mcp-adapter.ts   # Railway deployment adapter
│   ├── 📁 clients/                  # MCP client implementations
│   │   └── mcp-client.ts            # MCP client for testing
│   ├── 📁 monitoring/               # Monitoring & health checks
│   │   ├── monitor.ts               # Server monitoring
│   │   └── keepalive.js             # Keep-alive script
│   ├── 📁 types/                    # TypeScript type definitions
│   └── 📁 utils/                    # Utility functions
├── 📁 config/                       # Configuration files
│   ├── 📁 environments/             # Environment-specific configs
│   │   ├── claude-desktop-*.json    # Claude Desktop configurations
│   │   └── railway-mcp-adapter-config.json
│   └── 📁 deployments/              # Deployment configurations
│       ├── Dockerfile*              # Docker configurations
│       ├── railway*.toml            # Railway deployment configs
│       └── nixpacks.toml            # Nixpacks configuration
├── 📁 scripts/                      # Scripts and automation
│   ├── 📁 setup/                    # Setup scripts
│   │   ├── setup-claude-desktop.sh
│   │   └── start.sh
│   ├── 📁 testing/                  # Test scripts
│   │   ├── test-*.js                # JavaScript test files
│   │   └── test-*.sh                # Shell test scripts
│   └── 📁 deployment/               # Deployment scripts
│       └── deploy-to-railway.sh
├── 📁 docs/                         # Documentation
│   ├── 📁 setup/                    # Setup guides
│   ├── 📁 deployment/               # Deployment guides
│   └── 📁 api/                      # API documentation
├── 📁 examples/                     # Example configurations
│   └── n8n-workflow-example.json
├── 📁 tests/                        # Test suites
│   ├── helpers/
│   └── *.spec.ts
├── 📄 index.ts                      # Main entry point
├── 📄 package.json                  # Project configuration
├── 📄 tsconfig.json                 # TypeScript configuration
├── 📄 playwright.config.ts          # Playwright configuration
└── 📄 README.md                     # Project documentation
```

## 🚀 Key Improvements

### 1. **Clear Separation of Concerns**

- **Core**: Essential server functionality and MCP protocol
- **Adapters**: Different ways to expose the server (HTTP, Railway, etc.)
- **Clients**: MCP client implementations for testing
- **Monitoring**: Health checks and monitoring tools
- **Config**: Environment-specific and deployment configurations

### 2. **Organized Scripts**

- **Setup**: Initial setup and configuration scripts
- **Testing**: All test-related scripts in one place
- **Deployment**: Deployment automation scripts

### 3. **Structured Documentation**

- **Setup**: Detailed setup guides
- **Deployment**: Platform-specific deployment instructions
- **API**: API reference and examples

### 4. **Updated Package Scripts**

```json
{
  "dev": "tsx --expose-gc index.ts",
  "dev:stdio": "MODE=stdio tsx --expose-gc index.ts",
  "dev:http": "MODE=http tsx --expose-gc index.ts",
  "start:stdio": "MODE=stdio node --expose-gc --max-old-space-size=4096 dist/index.js",
  "start:http": "MODE=http node --expose-gc --max-old-space-size=4096 dist/index.js"
}
```

## 🔧 Usage

### Development

```bash
# Stdio mode (for MCP clients)
npm run dev:stdio

# HTTP mode (for web access)
npm run dev:http
```

### Production

```bash
# Build first
npm run build

# Then start
npm run start:stdio  # or start:http
```

## 📝 Benefits

1. **Maintainability**: Clear organization makes it easier to find and modify code
2. **Scalability**: Easy to add new adapters, clients, or monitoring tools
3. **Documentation**: Well-organized docs make onboarding easier
4. **Testing**: Centralized test scripts and utilities
5. **Deployment**: Clear separation of deployment configurations

## 🎯 Next Steps

1. **Add Type Definitions**: Populate `src/types/` with shared interfaces
2. **Utility Functions**: Add common utilities to `src/utils/`
3. **Enhanced Documentation**: Expand docs in each category
4. **CI/CD**: Add GitHub Actions for automated testing and deployment
