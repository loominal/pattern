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

| Parent Memory Scope | Sub-Agent Access |
|---------------------|------------------|
| `private` (`recent`, `tasks`, `longterm`) | Read access |
| `personal` (`core`) | No access (identity-defining, protected) |
| `team` | Full read/write |
| `public` | Full read/write |

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

### Unified Scope System

Pattern uses a 4-value scope system that determines both visibility and storage location:

| Scope | Visibility | Storage | Use Case |
|-------|------------|---------|----------|
| `private` | Just this agent, this project | Project bucket | Working notes, temp observations |
| `personal` | Just this agent, everywhere | User bucket | Profile, preferences, cross-project identity |
| `team` | All agents in this project | Project bucket | Project decisions, shared learnings |
| `public` | All agents everywhere | Global bucket | Global knowledge, public templates |

### Private/Personal Categories (Agent-Specific)

| Category | TTL | Default Scope | Description |
|----------|-----|---------------|-------------|
| `recent` | 24h | `private` | Short-term observations and learnings |
| `tasks` | 24h | `private` | Current work items and todos |
| `longterm` | None | `private` | Permanent insights worth keeping |
| `core` | None | `personal` | Identity-defining memories (follows user across projects) |

### Team/Public Categories (Shared)

| Category | Scope | Description |
|----------|-------|-------------|
| `decisions` | `team` | Project decisions and rationale |
| `architecture` | `team` | Architecture choices and patterns |
| `learnings` | `team` | Knowledge shared across agents |

## MCP Tools

### `remember`

Store a new memory with specified scope and category.

```json
{
  "content": "The API uses REST with JSON responses",
  "scope": "private",  // "private" | "personal" | "team" | "public"
  "category": "longterm",
  "metadata": {
    "tags": ["api", "architecture"],
    "priority": 1
  }
}
```

**Security Note** (v0.3.1+): Content is scanned for common secret patterns (API keys, passwords, etc.) and warnings are issued if detected. Never store credentials directly. See [Security Best Practices](#security-best-practices).

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

Store an identity-defining memory with `personal` scope (follows user across projects, max 100 per agent).

```json
{
  "content": "I am a coding assistant that prioritizes test coverage"
}
```

**Security Note**: Core memories use `personal` scope and follow the agent across all projects. Never store project-specific secrets in core memories. Sub-agents cannot access parent core memories for additional protection.

### `forget`

Delete a memory by ID.

```json
{
  "memoryId": "550e8400-e29b-41d4-a716-446655440000",
  "force": true  // Required for core memories
}
```

### `recall-context`

Retrieve memory context at session start with powerful filtering and search capabilities.

**Basic Parameters:**
```json
{
  "scopes": ["private", "personal", "team"],  // Filter by scope
  "categories": ["core", "longterm", "decisions"],  // Filter by category
  "limit": 50,  // Max memories to return (default: 50, max: 200)
  "since": "2025-01-01T00:00:00Z"  // Only memories updated after this
}
```

**Advanced Filtering (v0.4.0+):**
```json
{
  // Tag filtering (AND logic - memory must have all tags)
  "tags": ["api", "documentation"],

  // Priority filtering (1=high, 2=medium, 3=low)
  "minPriority": 1,  // Minimum priority
  "maxPriority": 2,  // Maximum priority

  // Date range filtering
  "createdAfter": "2025-01-01T00:00:00Z",   // Created after this date
  "createdBefore": "2025-01-31T00:00:00Z",  // Created before this date
  "updatedAfter": "2025-01-15T00:00:00Z",   // Updated after this date
  "updatedBefore": "2025-01-31T00:00:00Z",  // Updated before this date

  // Content search (case-insensitive)
  "search": "authentication"
}
```

**Examples:**

Find high-priority API documentation created this month:
```json
{
  "tags": ["api", "docs"],
  "maxPriority": 1,
  "createdAfter": "2025-01-01T00:00:00Z",
  "search": "REST"
}
```

Find recent architecture decisions:
```json
{
  "scopes": ["team"],
  "categories": ["architecture", "decisions"],
  "updatedAfter": "2025-01-01T00:00:00Z"
}
```

**Returns:**
```json
{
  "private": [...],
  "personal": [...],
  "team": [...],
  "public": [...],
  "summary": "Key points from your memories...",
  "counts": {
    "private": 25,
    "personal": 5,
    "team": 10,
    "public": 0,
    "expired": 5
  }
}
```

**Filter Logic:**
- All filters are applied as AND conditions (memories must match all specified filters)
- Tag filtering uses AND logic (memory must have ALL specified tags)
- Memories without priority metadata default to priority 2 (medium)
- Empty or unspecified filters are ignored (e.g., `tags: []` returns all memories)

### `share-learning`

Share a private/personal memory with all project agents (moves to `team` scope).

```json
{
  "memoryId": "550e8400-e29b-41d4-a716-446655440000",
  "category": "learnings",
  "keepOriginal": false
}
```

**Security Note**: Sharing makes the memory visible to **all agents in the project**. Review content for sensitive information before sharing. Once shared to team scope, it cannot be un-shared (only deleted).

### `cleanup`

Run maintenance tasks to expire TTL memories and enforce limits.

```json
{
  "expireOnly": false
}
```

### `export-memories`

Export memories to a JSON file for backup or transfer. Supports filtering by scope, category, and date range.

```json
{
  "outputPath": "/path/to/backup.json",  // Optional, defaults to memories-backup-TIMESTAMP.json
  "scope": "private",                    // Optional: "private" | "personal" | "team" | "public"
  "category": "longterm",                 // Optional: filter by category
  "since": "2025-01-01T00:00:00Z",       // Optional: only export memories updated after this
  "includeExpired": false                 // Optional: include expired memories (default: false)
}
```

Returns:
```json
{
  "exported": 42,
  "filepath": "/absolute/path/to/backup.json",
  "bytes": 8192
}
```

**Use Cases**:
- Create backups before making major changes
- Export specific categories for sharing or archival
- Transfer memories between agents or projects
- Export recent changes using the `since` parameter

**Security Note**: Exported files are unencrypted JSON. Store backups securely and review contents before sharing. Never commit backup files with sensitive information to version control.

### `import-memories`

Import memories from a JSON backup file created by `export-memories`.

```json
{
  "inputPath": "/path/to/backup.json",   // Required: path to backup file
  "overwriteExisting": false,             // Optional: overwrite if memory ID exists (default: false)
  "skipInvalid": true                     // Optional: skip invalid entries instead of failing (default: true)
}
```

Returns:
```json
{
  "imported": 40,
  "skipped": 2,
  "errors": [
    "Memory mem-123 already exists (use overwriteExisting to replace)",
    "Invalid memory structure: mem-456"
  ]
}
```

**Validation**:
- Checks JSON format and export version
- Validates memory structure and required fields
- Validates scope/category combinations
- Checks for duplicate memory IDs (unless `overwriteExisting` is true)

**Error Handling**:
- With `skipInvalid: true` (default): Continues importing valid memories, reports errors
- With `skipInvalid: false`: Stops on first error and throws exception

**Security Note**: Import validates data but trusts the source file. Only import from trusted sources. Review the backup file contents before importing, especially when restoring from external sources.

### `remember-bulk`

Store multiple memories at once with validation and error handling. Efficiently batch-store memories with optional pre-flight validation.

```json
{
  "memories": [
    {
      "content": "First memory",
      "category": "longterm"
    },
    {
      "content": "Second memory",
      "scope": "team",
      "category": "decisions",
      "metadata": {
        "tags": ["important"],
        "priority": 1
      }
    },
    {
      "content": "Third memory",
      "scope": "personal",
      "category": "core"
    }
  ],
  "stopOnError": false,  // Optional: stop on first error vs continue (default: false)
  "validate": true       // Optional: validate all before storing any (default: true)
}
```

Returns:
```json
{
  "stored": 3,
  "failed": 0,
  "errors": [],
  "memoryIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  ]
}
```

**Parameters**:
- `memories`: Array of memory objects, each with the same fields as the `remember` tool
- `stopOnError`: If true, stops on first error; if false (default), continues and reports all errors
- `validate`: If true (default), validates all memories before storing any; if false, validates during storage

**Validation** (when `validate: true`):
- Pre-flight validation checks all memories before storing
- Validates content size (max 32KB), scope/category combinations, metadata structure
- If any validation errors occur, nothing is stored and a PatternError is thrown
- All validation errors are reported with their array indices

**Error Handling**:
- With `stopOnError: false` (default): Continues storing valid memories, reports all errors
- With `stopOnError: true`: Stops at first error, returns partial results
- Errors include the array index and error message for troubleshooting

**Use Cases**:
- Bulk import of memories from external sources
- Initializing agent memory with multiple entries
- Batch creation of project documentation or decisions
- Migrating memories between systems

**Performance**: Not atomic - failures can leave partial results. Use validation to catch errors upfront.

**Security Note**: Each memory is scanned individually for sensitive content (same as `remember` tool). Review warnings in logs.

### `forget-bulk`

Delete multiple memories by IDs with error handling. Efficiently batch-delete memories with optional force flag for core memories.

```json
{
  "memoryIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  ],
  "stopOnError": false,  // Optional: stop on first error vs continue (default: false)
  "force": false         // Optional: force delete core memories (default: false)
}
```

Returns:
```json
{
  "deleted": 3,
  "failed": 0,
  "errors": []
}
```

**Parameters**:
- `memoryIds`: Array of memory IDs (UUIDs) to delete
- `stopOnError`: If true, stops on first error; if false (default), continues and reports all errors
- `force`: If true, allows deletion of core memories; if false (default), core memories are protected

**Error Handling**:
- With `stopOnError: false` (default): Continues deleting valid memories, reports all errors
- With `stopOnError: true`: Stops at first error, returns partial results
- Common errors: memory not found, core memory without force flag, access denied (for team/public memories created by others)
- Errors include the memory ID and error message for troubleshooting

**Access Control**:
- Can only delete your own private/personal memories
- Can only delete team/public memories you created
- Core memories require `force: true` flag
- Same rules as the `forget` tool apply to each memory

**Use Cases**:
- Cleanup of multiple obsolete memories
- Bulk removal of temporary or expired entries
- Clearing out test data
- Memory management during refactoring

**Performance**: Not atomic - failures can leave partial results. Each memory is deleted independently.

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

## Security Best Practices

### What NOT to Store

Pattern stores data in **plaintext** in NATS KV. Never store:

- 🚫 **Credentials**: Passwords, API keys, tokens, certificates
- 🚫 **PII**: Social Security Numbers, credit cards, medical records
- 🚫 **Secrets**: Database credentials, OAuth secrets, private keys

### Content Scanning (v0.3.1+)

Pattern includes an opt-in content scanner that detects common secret patterns (API keys, passwords, private keys, etc.) and warns before storage. Disable if needed:

```bash
export PATTERN_DISABLE_CONTENT_SCAN=true
```

### Secure Your NATS Connection

**Use TLS for production**:
```bash
# WebSocket with TLS
export NATS_URL="wss://user:pass@nats.example.com"

# TCP with TLS
export NATS_URL="tls://user:pass@nats.example.com:4222"
```

### Client-Side Encryption

For sensitive content that must be stored, use client-side encryption:

```typescript
import { createCipheriv, randomBytes } from 'crypto';

// Encrypt before storing
const key = Buffer.from(process.env.PATTERN_ENCRYPTION_KEY!, 'hex');
const iv = randomBytes(16);
const cipher = createCipheriv('aes-256-cbc', key, iv);
const encrypted = cipher.update('sensitive data', 'utf8', 'base64') + cipher.final('base64');

await remember({
  content: iv.toString('base64') + ':' + encrypted,
  metadata: { tags: ['encrypted'] }
});
```

**See [docs/SECURITY.md](docs/SECURITY.md) for comprehensive security guidance**, including:
- Threat model and what Pattern protects against
- Encryption examples with key management
- Access control best practices
- Incident response procedures

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
- **Unified Scope Model**: 4-value scope (`private`, `personal`, `team`, `public`) shared with Warp and Weft for consistent semantics
- **Multi-Bucket Storage**: Different scopes route to different NATS KV buckets (project bucket, user bucket, global bucket)
- **Project Isolation**: Each project gets its own NATS KV bucket for `private` and `team` scope
- **Personal Memories**: Core memories use `personal` scope, stored in user bucket, accessible across all projects
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
