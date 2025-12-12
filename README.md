# Loom Pattern

MCP server providing hierarchical memory for AI agents.

[![Tests](https://github.com/mdlopresti/loom-pattern/actions/workflows/ci.yml/badge.svg)](https://github.com/mdlopresti/loom-pattern/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)](https://github.com/mdlopresti/loom-pattern)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

Pattern is a Model Context Protocol (MCP) server that provides hierarchical memory capabilities for AI agents. It enables agents to:

- **Remember** information across sessions with automatic expiration
- **Share** learnings with other agents in the same project
- **Recall** context efficiently at session startup
- **Isolate** memories by project and agent for security

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- NATS server with JetStream enabled

### Installation

```bash
npm install @loom/pattern
```

Or run directly:

```bash
npx @loom/pattern
```

### Configuration

Set environment variables:

```bash
export NATS_URL="nats://localhost:4222"      # NATS server URL
export LOOM_PROJECT_ID="my-project"          # Project isolation key
export LOOM_AGENT_ID="agent-123"             # Agent identity (optional)
export DEBUG="true"                          # Enable debug logging (optional)
```

### Running

```bash
# Start the MCP server
pattern

# Or with npm
npm start
```

### Claude Code Integration

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "pattern": {
      "command": "npx",
      "args": ["@loom/pattern"],
      "env": {
        "NATS_URL": "nats://localhost:4222",
        "LOOM_PROJECT_ID": "my-project"
      }
    }
  }
}
```

## Memory Model

### Private Memories (Agent-Specific)

| Category | TTL | Description |
|----------|-----|-------------|
| `recent` | 24h | Short-term observations and learnings |
| `tasks` | 24h | Current work items and todos |
| `longterm` | None | Permanent insights worth keeping |
| `core` | None | Identity-defining memories (protected) |

### Shared Memories (Project-Wide)

| Category | Description |
|----------|-------------|
| `decisions` | Project decisions and rationale |
| `architecture` | Architecture choices and patterns |
| `learnings` | Knowledge shared across agents |

## MCP Tools

### `remember`

Store a new memory with specified scope and category.

```json
{
  "content": "The API uses REST with JSON responses",
  "scope": "private",
  "category": "longterm",
  "metadata": {
    "tags": ["api", "architecture"],
    "priority": 1
  }
}
```

### `remember-task`

Quick shorthand to remember a task (private, 24h TTL).

```json
{
  "content": "Fix the authentication bug in login.ts"
}
```

### `remember-learning`

Quick shorthand to remember a learning (private, 24h TTL).

```json
{
  "content": "The database uses PostgreSQL with pgvector"
}
```

### `commit-insight`

Promote a temporary memory to permanent storage.

```json
{
  "memoryId": "550e8400-e29b-41d4-a716-446655440000",
  "newContent": "Updated insight with more details"
}
```

### `core-memory`

Store an identity-defining memory (use sparingly, max 100 per agent).

```json
{
  "content": "I am a coding assistant that prioritizes test coverage"
}
```

### `forget`

Delete a memory by ID.

```json
{
  "memoryId": "550e8400-e29b-41d4-a716-446655440000",
  "force": true  // Required for core memories
}
```

### `recall-context`

Retrieve memory context at session start.

```json
{
  "scope": "both",
  "categories": ["core", "longterm", "decisions"],
  "limit": 50,
  "since": "2025-01-01T00:00:00Z"
}
```

Returns:
```json
{
  "private": [...],
  "shared": [...],
  "summary": "Key points from your memories...",
  "counts": {
    "private": 25,
    "shared": 10,
    "expired": 5
  }
}
```

### `share-learning`

Share a private memory with all project agents.

```json
{
  "memoryId": "550e8400-e29b-41d4-a716-446655440000",
  "category": "learnings",
  "keepPrivate": false
}
```

### `cleanup`

Run maintenance tasks to expire TTL memories and enforce limits.

```json
{
  "expireOnly": false
}
```

### `pattern_health`

Check server health and connection status.

## Authentication

Pattern supports NATS authentication via:

1. **URL credentials**: `nats://user:pass@host:port`
2. **Environment variables**: `NATS_USER` and `NATS_PASS`

For WebSocket connections through proxies:
```bash
export NATS_URL="wss://user:pass@nats.example.com"
```

## Storage Limits

| Limit | Value |
|-------|-------|
| Max memory size | 32KB |
| Max memories per agent | 10,000 |
| Max shared memories per project | 10,000 |
| Max core memories per agent | 100 |
| Recent/Tasks category limit | 1,000/500 |

## Development

```bash
# Clone the repository
git clone https://github.com/mdlopresti/loom-pattern.git
cd loom-pattern

# Install dependencies
npm install

# Run tests
npm test
npm run test:coverage

# Build
npm run build

# Watch mode
npm run dev

# Lint and format
npm run lint
npm run format
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │     │   Other Agent   │
│   (MCP Client)  │     │   (MCP Client)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │   Pattern   │  MCP Server
              │  (Memory)   │  - Tools, Session
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │  NATS KV    │  Storage Backend
              │ (JetStream) │  - Persistence
              └─────────────┘
```

## Key Design Decisions

- **Project Isolation**: Each project gets its own NATS KV bucket
- **Agent Privacy**: Private memories keyed by agentId, never visible to others
- **TTL Management**: Application-level expiration (NATS KV doesn't support per-key TTL)
- **Summary Generation**: 4KB max summary from prioritized memories

## Related Projects

- [Loom Warp](https://github.com/mdlopresti/loom-warp) - MCP server for agent communication
- [Loom Weft](https://github.com/mdlopresti/loom-weft) - Coordinator service for work routing
- [Loom Shuttle](https://github.com/mdlopresti/loom-shuttle) - CLI for fleet management

## License

MIT - Michael LoPresti
