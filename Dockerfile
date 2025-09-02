FROM node:22-slim

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    ca-certificates \
    procps \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Install dev dependencies for build
RUN npm ci --ignore-scripts

# Install Playwright with Chromium
RUN npx playwright install chromium --with-deps

# Copy source code and startup script
COPY src/ ./src/
COPY start.sh ./

# Make startup script executable
RUN chmod +x start.sh

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files to reduce image size
RUN npm prune --production
RUN rm -rf src/ tsconfig.json node_modules/.cache

# Create non-root user for security
RUN groupadd -r playwright && useradd -r -g playwright -G audio,video playwright \
    && mkdir -p /home/playwright/.cache \
    && chown -R playwright:playwright /home/playwright \
    && chown -R playwright:playwright /app

# Set up proper permissions for Playwright
RUN chmod -R 755 /app
RUN chmod -R 755 /home/playwright

USER playwright

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["./start.sh"]