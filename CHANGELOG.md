# Changelog

All notable changes to Pattern will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2025-12-23

### Added

#### Phase 1.1: Storage Test Coverage
- Added 89 new storage layer tests across 3 test files
  - `nats-kv-multibucket.test.ts` - Multi-bucket operations (30 tests)
  - `nats-kv-transport.test.ts` - Transport and connection tests (36 tests)
  - `nats-kv-buckets.test.ts` - Bucket management tests (23 tests)
- Improved storage layer coverage from 57.31% to **70.45%**
- Tests cover WebSocket transport (wss://, ws://), TCP transport (nats://, tls://)
- Tests cover authentication variants (URL credentials, environment variables)
- Tests cover connection failures, bucket isolation, concurrent operations

#### Phase 1.2: Content Scanning
- **New security module** (`src/security/content-scanner.ts`)
  - Regex-based content scanner detecting 10 types of sensitive patterns
  - API keys (generic, AWS, GitHub, JWT)
  - Passwords and credentials
  - Private keys (RSA, EC, OpenSSH)
  - PII (emails, credit cards, Social Security Numbers)
- **Non-blocking warnings** before storage (never prevents storing)
- Redacted samples in warnings (shows first 3 + last 3 characters)
- Grouped warnings by type for clarity
- **Opt-out mechanism** via `PATTERN_CONTENT_SCANNING=false` environment variable
- Singleton pattern with configurable detection patterns
- Integrated with all remember tools:
  - `remember()` - scan content before storage
  - `remember-task()` - scan task content
  - `remember-learning()` - scan learning content
  - `core-memory()` - scan core memories
- Added 73 new tests with **97.03% coverage** of security module
  - `content-scanner.test.ts` - Pattern detection tests (400+ assertions)
  - `content-scanner-integration.test.ts` - Tool integration tests (150+ assertions)

#### Phase 1.3: Security Documentation
- **New comprehensive security guide** (`docs/SECURITY.md`, 441 lines)
  - Clear threat model (what Pattern protects and doesn't protect)
  - Data storage security by scope (private, personal, team, public)
  - Explicit "What NOT to Store" lists (credentials, PII, secrets)
  - Content scanning feature documentation
  - **Complete AES-256-CBC encryption example** (working TypeScript code)
  - Key management best practices
  - **5-step incident response procedure** for accidental secret storage
  - Security monitoring recommendations (NATS logs, audit trails)
  - **3 actionable checklists** (prevention, dev config, prod config)
  - **FAQ section** with compliance guidance (GDPR, HIPAA, SOC2)
  - Vulnerability reporting process
- **README.md security section** (64 lines)
  - What NOT to store (credentials, PII, secrets)
  - Content scanning feature (v0.3.1+)
  - Secure NATS connection examples (TLS/WebSocket)
  - Client-side encryption quick reference
  - Link to comprehensive SECURITY.md
- **Tool documentation security notes** for 3 tools:
  - `remember()` - Content scanning warning
  - `core-memory()` - Personal scope warning (follows across projects)
  - `share-learning()` - Team visibility warning

### Changed
- Updated `PatternConfig` type to include `contentScanning` configuration
- Modified `loadConfig()` to load `PATTERN_CONTENT_SCANNING` environment variable (default: enabled)
- Updated `handleToolCall()` to pass config to tool handlers
- Enhanced remember tools to scan content and emit warnings

### Fixed
- Storage layer edge cases now covered by comprehensive tests
- Connection failure scenarios properly tested and documented

### Security
- Content scanning helps prevent accidental storage of secrets, credentials, and PII
- Security documentation provides clear guidance on protecting sensitive data
- Client-side encryption examples for sensitive content that must be stored
- Non-blocking warnings maintain backward compatibility

## [0.3.0] - 2025-12-20

### Added
- Initial Beta release of Pattern MCP server
- Hierarchical memory storage with NATS JetStream backend
- Four-scope model: private, personal, team, public
- Seven memory categories: recent, tasks, longterm, core, decisions, architecture, learnings
- Nine MCP tools:
  - `remember` - Store memories with scope and category
  - `remember-task` - Quick task storage (24h TTL)
  - `remember-learning` - Quick learning storage (24h TTL)
  - `commit-insight` - Promote temporary to permanent memory
  - `core-memory` - Store identity-defining memories
  - `forget` - Delete memories
  - `recall-context` - Retrieve memories with 4KB summary
  - `share-learning` - Share private memories to team scope
  - `cleanup` - Expire TTL memories and enforce limits
- TTL support (24h for recent/tasks categories)
- Sub-agent memory access controls
- Multi-bucket NATS KV architecture (project, user, global buckets)
- WebSocket and TCP transport support
- Authentication via URL or environment variables
- Comprehensive test suite (384 tests, 76.83% coverage)

### Documentation
- Complete README.md with usage examples
- API documentation for all tools
- Architecture overview
- Multi-scope isolation model

## [0.2.0] - 2025-12-15

### Added
- Initial alpha release (internal)
- Basic memory storage with NATS KV
- Simple scope model (private/shared)
- Core MCP tool implementations

## [0.1.0] - 2025-12-10

### Added
- Project initialization
- NATS integration proof of concept
- MCP server foundation

---

## Version Summary

| Version | Release Date | Highlights |
|---------|--------------|------------|
| **0.3.1** | 2025-12-23 | **Beta Enhancement**: Content scanning, security docs, 70%+ storage coverage |
| **0.3.0** | 2025-12-20 | **Beta Release**: Full feature set, 9 tools, 4-scope model |
| 0.2.0 | 2025-12-15 | Alpha release (internal) |
| 0.1.0 | 2025-12-10 | Initial proof of concept |

## Upgrade Guide

### Upgrading from 0.3.0 to 0.3.1

**No breaking changes.** This is a backward-compatible enhancement release.

**New Features:**
1. **Content Scanning** (enabled by default)
   - Automatically warns if secrets/PII detected in memory content
   - Opt-out: Set `PATTERN_CONTENT_SCANNING=false`

2. **Security Documentation**
   - Read `docs/SECURITY.md` for comprehensive security guidance
   - See README.md "Security Best Practices" section for quick reference

**Action Required:**
- None. Content scanning is non-blocking and backward compatible.
- **Recommended**: Review `docs/SECURITY.md` for security best practices

**What's Changed:**
- 73 new tests added (546 total)
- Coverage increased to 82.23% (from 81.09%)
- New security module with 97% coverage

---

[Unreleased]: https://github.com/loominal/pattern/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/loominal/pattern/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/loominal/pattern/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/loominal/pattern/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/loominal/pattern/releases/tag/v0.1.0
