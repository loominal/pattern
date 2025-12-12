# Loom Pattern

MCP server for hierarchical agent memory.

## Status

**Version**: 0.1.0
**Phase**: 11.1 - Foundation & Design (Scaffold Complete)

## Overview

Pattern provides a hierarchical memory system for AI agents, supporting both private and shared memories with automatic expiration and project isolation.

## Memory Model

- **Private Memories**: Agent-specific, isolated by agent ID
  - `recent` - Short-term (24h TTL)
  - `tasks` - Current work (24h TTL)
  - `longterm` - Permanent insights
  - `core` - Identity-defining (protected)

- **Shared Memories**: Visible to all agents in a project
  - `decisions` - Project decisions
  - `architecture` - Architecture choices
  - `learnings` - Shared knowledge

## Storage

- **V1**: NATS KV (JetStream-based key-value store)
- **V2** (Planned): Pluggable backends (file, memory, etc.)

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Set environment variables
export NATS_URL="nats://localhost:4222"
export PROJECT_ID="my-project"
export AGENT_ID="agent-123"  # Optional
export DEBUG="true"          # Optional

# Start the server
npm start
```

## Development

```bash
# Watch mode
npm run dev

# Run tests
npm test
npm run test:coverage

# Linting and formatting
npm run lint
npm run format
```

## Implementation Status

- [x] Project scaffold
- [x] TypeScript configuration
- [x] Memory data model (types.ts)
- [x] Configuration loading
- [x] Logger utility
- [x] Storage interface
- [ ] NATS KV backend (Phase 11.2)
- [ ] MCP server (Phase 11.3)
- [ ] MCP tools (Phase 11.4)
- [ ] Integration tests (Phase 11.5)

## License

MIT - Michael LoPresti
