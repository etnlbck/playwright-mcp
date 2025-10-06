# Playwright MCP Server

A Model Context Protocol (MCP) server that exposes Playwright browser automation capabilities as tools for AI agents.

## 🏗️ Project Structure

```
playwrightMCP/
├── src/                          # Source code
│   ├── core/                     # Core server functionality
│   │   ├── index.ts             # Main server entry point
│   │   ├── server.ts            # PlaywrightMCPServer class
│   │   └── mcp-http-server.ts   # HTTP MCP server
│   ├── adapters/                 # Server adapters
│   │   ├── http-mcp-adapter.ts  # HTTP MCP adapter
│   │   ├── http-server.ts       # HTTP server
│   │   ├── minimal-server.ts    # Minimal server
│   │   └── railway-mcp-adapter.ts # Railway adapter
│   ├── clients/                  # Client implementations
│   │   └── mcp-client.ts        # MCP client
│   ├── monitoring/               # Monitoring and health checks
│   │   ├── monitor.ts           # Server monitor
│   │   └── keepalive.js         # Keep-alive script
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
├── config/                       # Configuration files
│   ├── environments/             # Environment-specific configs
│   │   ├── claude-desktop-*.json
│   │   └── railway-mcp-adapter-config.json
│   └── deployments/              # Deployment configurations
│       ├── Dockerfile*
│       ├── railway*.toml
│       └── nixpacks.toml
├── scripts/                      # Scripts and automation
│   ├── setup/                    # Setup scripts
│   │   ├── setup-claude-desktop.sh
│   │   └── start.sh
│   ├── testing/                  # Test scripts
│   │   ├── test-*.js
│   │   └── test-*.sh
│   └── deployment/               # Deployment scripts
│       └── deploy-to-railway.sh
├── docs/                         # Documentation
│   ├── setup/                    # Setup guides
│   ├── deployment/               # Deployment guides
│   └── api/                      # API documentation
├── examples/                     # Example configurations
│   └── n8n-workflow-example.json
├── tests/                        # Test suites
│   ├── helpers/
│   └── *.spec.ts
├── index.ts                      # Main entry point
├── package.json
├── tsconfig.json
└── playwright.config.ts
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Playwright browsers installed

### Installation

```bash
npm install
npx playwright install
```

### Running the Server

#### Stdio Mode (for MCP clients)
```bash
npm run dev
# or
MODE=stdio npx tsx index.ts
```

#### HTTP Mode (for web access)
```bash
MODE=http npx tsx index.ts
# or
PORT=3000 npx tsx index.ts
```

### Available Scripts

- `npm run dev` - Start in development mode (stdio)
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run Playwright tests
- `npm run migrate` - Run database migrations
- `npm run migrate:status` - Check migration status

## 🔧 Configuration

### Environment Variables

- `MODE` - Server mode: `stdio` or `http` (default: `stdio`)
- `PORT` - HTTP server port (default: `3000`)
- `PLAYWRIGHT_MCP_AUTH_TOKEN` - Authentication token for HTTP mode

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "playwright-mcp": {
    "command": "node",
    "args": ["/path/to/playwrightMCP/dist/index.js"],
    "cwd": "/path/to/playwrightMCP",
    "env": {
      "MODE": "stdio"
    }
  }
}
```

## 🛠️ Development

### Project Structure Philosophy

- **Core**: Essential server functionality and MCP protocol implementation
- **Adapters**: Different ways to expose the server (HTTP, Railway, etc.)
- **Clients**: MCP client implementations for testing
- **Monitoring**: Health checks, keep-alive, and monitoring tools
- **Config**: Environment-specific and deployment configurations
- **Scripts**: Automation and utility scripts organized by purpose
- **Docs**: Comprehensive documentation organized by topic

### Adding New Features

1. **Core functionality**: Add to `src/core/`
2. **New adapters**: Add to `src/adapters/`
3. **Client tools**: Add to `src/clients/`
4. **Monitoring**: Add to `src/monitoring/`
5. **Types**: Add to `src/types/`
6. **Utilities**: Add to `src/utils/`

## 📚 Documentation

- [Setup Guide](docs/setup/) - Detailed setup instructions
- [Deployment Guide](docs/deployment/) - Deployment to various platforms
- [API Documentation](docs/api/) - API reference and examples

## 🤝 Contributing

1. Follow the established folder structure
2. Add appropriate documentation
3. Include tests for new features
4. Update this README if adding new top-level directories

## 📄 License

[Add your license information here]
