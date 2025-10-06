# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Playwright MCP (Model Context Protocol) server that provides browser automation capabilities via both stdio and HTTP interfaces. The server can be deployed to Railway and supports real-time streaming responses.

## Architecture

The project consists of three main components:

- `src/server.ts` - Core MCP server with Playwright tool implementations
- `src/http-server.ts` - HTTP wrapper with Express.js and SSE streaming support
- `src/index.ts` - Entry point that switches between stdio and HTTP modes

The server exposes 8 Playwright tools: navigate, screenshot, scrape, click, type, wait_for, get_url, and close_browser.

## Common Development Commands

- `npm install` - Install dependencies
- `npm run build` - Build TypeScript to dist/
- `npm run dev` - Run in development mode with tsx
- `npm start` - Run built server (requires build first)
- `npm run lint` - Lint code with ESLint
- `npm run type-check` - TypeScript type checking

## Deployment

### Railway
- Configured via `railway.toml` 
- Automatically sets MODE=http and uses health checks
- Includes resource limits (512MB memory, 0.25 CPU)

### Docker
- Multi-stage build with Playwright browser dependencies
- Runs as non-root user for security
- Installs only chromium browser to minimize size

## Environment Variables

- `MODE` - "stdio" (default) or "http" 
- `PORT` - HTTP server port (default: 3000)

## HTTP Endpoints

- `GET /health` - Health check
- `GET /tools` - List available MCP tools
- `POST /execute` - Execute tool with SSE streaming
- `POST /execute-sync` - Execute tool synchronously

## Development Notes

- Browser instances are shared across tool calls for efficiency
- All tools include proper error handling and input validation with Zod schemas
- HTTP mode supports CORS for web integration
- Screenshots return base64-encoded images via MCP image content type