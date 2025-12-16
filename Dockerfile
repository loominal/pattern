# Loom Pattern - MCP Server for Hierarchical Agent Memory
# Multi-stage build for minimal image size

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Add non-root user for security
RUN addgroup -g 1001 -S pattern && \
    adduser -S pattern -u 1001 -G pattern

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set ownership
RUN chown -R pattern:pattern /app

# Switch to non-root user
USER pattern

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV NATS_URL=nats://localhost:4222
ENV LOOMINAL_PROJECT_ID=default

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)"

# Run the MCP server
ENTRYPOINT ["node", "dist/index.js"]
