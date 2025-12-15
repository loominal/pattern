# Pattern

MCP server providing hierarchical memory for AI agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Beta](https://img.shields.io/badge/Status-Beta-blue.svg)](https://github.com/loominal/pattern)

> **Beta**: Core functionality tested and stable. Part of the [Loominal](https://github.com/loominal/loominal) multi-agent infrastructure.

## Overview

Pattern is a Model Context Protocol (MCP) server that provides hierarchical memory capabilities for AI agents. It enables agents to:

- **Remember** information across sessions with automatic expiration
- **Share** learnings with other agents in the same project
- **Recall** context efficiently at session startup
- **Isolate** memories by project and agent for security
- **Unified identity** with Warp for consistent agent identification

## Agent Identity

Pattern v0.2.0 integrates with Warp's unified identity system. Instead of generating ephemeral IDs, Pattern reads agent identity from Warp's NATS KV store.

### How It Works

1. **Warp initializes identity** at startup, storing it in NATS KV bucket `loom-identity-{projectId}`
2. **Pattern loads identity** with retry logic (10 attempts, ~5.5s total wait time)
3. **Same agent, same memories**: Restart Claude Code and your memories persist

### Multi-Machine Scenarios

For agents running on multiple machines that should share the same identity and memories, set `LOOMINAL_AGENT_ID` in Warp's configuration to override the automatic ID derivation.

### Sub-Agent Memory Access

Sub-agents (spawned by root agents for specialized tasks) can access their parent's memories:

| Parent Memory Type | Sub-Agent Access |
|-------------------|------------------|
| `recent`, `tasks`, `longterm` | Read access |
| `core` | No access (identity-defining, protected) |
| `shared` | Full read/write |

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- NATS server with JetStream enabled

### Installation

```bash
npm install @loominal/pattern
```

Or run directly:

```bash
npx @loominal/pattern
```

### Configuration

Set environment variables:

```bash
export NATS_URL="nats://localhost:4222"         # NATS server URL
export LOOMINAL_PROJECT_ID="my-project"         # Project isolation key (optional, derived from path)
export LOOMINAL_SUBAGENT_TYPE="specialized"     # Set by parent agent when spawning sub-agents
export DEBUG="true"                             # Enable debug logging (optional)
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
      "args": ["@loominal/pattern"],
      "env": {
        "NATS_URL": "nats://localhost:4222",
        "LOOMINAL_PROJECT_ID": "my-project"
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
git clone https://github.com/loominal/pattern.git
cd pattern

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

```mermaid
flowchart TB
    subgraph Clients["MCP Clients"]
        CC["Claude Code"]
        OA["Other Agent"]
    end

    subgraph Server["MCP Server"]
        Pattern["Pattern<br/>(Memory)"]
    end

    subgraph Storage["Storage Backend"]
        NATS["NATS KV<br/>(JetStream)"]
    end

    CC <--> Pattern
    OA <--> Pattern
    Pattern <--> NATS
```

## Key Design Decisions

- **Unified Identity**: Pattern reads identity from Warp's NATS KV store instead of generating ephemeral UUIDs. Same computer + same folder = same agent across restarts.
- **Project Isolation**: Each project gets its own NATS KV bucket
- **Agent Privacy**: Private memories keyed by agentId, never visible to others
- **TTL Management**: Application-level expiration (NATS KV doesn't support per-key TTL)
- **Summary Generation**: 4KB max summary from prioritized memories

## Related

- [Loominal](https://github.com/loominal/loominal) — Multi-agent infrastructure
- [Warp](https://github.com/loominal/warp) — MCP server for messaging
- [Weft](https://github.com/loominal/weft) — Work coordinator
- [Shuttle](https://github.com/loominal/shuttle) — Fleet management CLI

## License

MIT - Michael LoPresti
