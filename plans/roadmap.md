# Roadmap

## Batch 1 (Current - Priority 1: High Value, Low Effort)

### Phase 1.1: Improve Storage Test Coverage to 70%+
- **Status:** ⚪ Not Started
- **Tasks:**
  - [ ] Add WebSocket transport integration tests (test wss:// URLs)
  - [ ] Add NATS connection failure scenario tests (timeout, auth failure, network disconnect)
  - [ ] Add bucket creation edge case tests (permissions, quota, name conflicts)
  - [ ] Test NATS KV watch functionality (if used)
  - [ ] Run coverage report to verify 70%+ for storage layer
- **Effort:** M
- **Done When:**
  - Storage coverage >= 70% (currently 57.31%)
  - All new tests passing
  - No reduction in coverage for other layers
- **Plan:** [Pattern Beta Enhancements Plan](./pattern-beta-enhancements-plan.md#phase-11-improve-storage-test-coverage)

### Phase 1.2: Add Content Scanning for Secrets/PII
- **Status:** ⚪ Not Started
- **Tasks:**
  - [ ] Create `src/validation/content-scanner.ts` with regex patterns
  - [ ] Detect common secrets (AWS keys, API tokens, passwords, private keys)
  - [ ] Detect potential PII (emails, phone numbers, SSNs)
  - [ ] Add `scanContent()` helper function
  - [ ] Integrate into `remember` tool (log warnings, don't block)
  - [ ] Add unit tests for scanner
  - [ ] Add opt-out via environment variable `PATTERN_DISABLE_CONTENT_SCAN`
- **Effort:** S
- **Done When:**
  - Scanner detects 10+ common secret patterns
  - Warnings logged when secrets detected (not errors)
  - 100% test coverage for scanner logic
  - Environment variable to disable works

### Phase 1.3: Document Security Best Practices
- **Status:** ⚪ Not Started
- **Tasks:**
  - [ ] Create `docs/SECURITY.md` with security guidelines
  - [ ] Document what NOT to store in memories (passwords, tokens, keys)
  - [ ] Document encryption patterns for sensitive content
  - [ ] Document content scanner behavior and opt-out
  - [ ] Document NATS authentication best practices
  - [ ] Add security section to README.md
  - [ ] Add link to SECURITY.md in README.md
- **Effort:** S
- **Done When:**
  - SECURITY.md covers all risks from ARCHITECTURE_ANALYSIS.md Section 6.4
  - README.md has security section linking to SECURITY.md
  - Examples show encryption patterns

---

## Batch 2 (Blocked by Batch 1 - Priority 2: Medium Value/Effort)

### Phase 2.1: Add JSON Backup/Export Functionality
- **Status:** 🔴 Blocked
- **Depends On:** Phase 1.1 (storage tests stable)
- **Tasks:**
  - [ ] Create `src/tools/export-memories.ts` tool
  - [ ] Create `src/tools/import-memories.ts` tool
  - [ ] Support exporting by scope (private, personal, team, public)
  - [ ] Support exporting by category
  - [ ] Output JSON with metadata (export date, version, agent info)
  - [ ] Import with merge strategy (skip existing) or overwrite
  - [ ] Add validation for imported JSON schema
  - [ ] Add unit tests for both tools
  - [ ] Add integration test for export → import round-trip
- **Effort:** M
- **Done When:**
  - Can export all memories to JSON file
  - Can import JSON with merge or overwrite
  - Round-trip test passes (export → import → verify)
  - JSON schema validation prevents corrupt imports
  - Tool definitions added to `src/tools/index.ts`

### Phase 2.2: Add Basic Query Enhancements (Client-Side)
- **Status:** 🔴 Blocked
- **Depends On:** Batch 1 complete (parallel with 2.1, 2.3)
- **Tasks:**
  - [ ] Create `src/query/filters.ts` with filter helper functions
  - [ ] Add `filterByTags(memories, tags)` - match any tag
  - [ ] Add `filterByPriority(memories, priority)` - exact or range
  - [ ] Add `filterByContent(memories, searchText)` - substring search
  - [ ] Add `filterByRelated(memories, memoryId)` - find related memories
  - [ ] Add `sortByPriority(memories)` helper
  - [ ] Add `sortByRecency(memories)` helper
  - [ ] Add comprehensive unit tests
  - [ ] Update `recall-context` tool to use filters (optional parameters)
  - [ ] Document query capabilities in README.md
- **Effort:** M
- **Done When:**
  - All filter functions work correctly
  - Can filter recall-context by tags, priority, content
  - 100% test coverage for query module
  - Documentation updated with examples

### Phase 2.3: Add Batch Operations
- **Status:** 🔴 Blocked
- **Depends On:** Batch 1 complete (parallel with 2.1, 2.2)
- **Tasks:**
  - [ ] Create `src/tools/remember-bulk.ts` tool
  - [ ] Create `src/tools/forget-bulk.ts` tool
  - [ ] Design bulk API - accept array of memory inputs
  - [ ] Validate all memories before any writes (atomic validation)
  - [ ] Return detailed results (success count, errors per item)
  - [ ] Add transaction-like behavior (all succeed or all fail) option
  - [ ] Add unit tests for both tools
  - [ ] Add integration test for bulk operations
  - [ ] Mark as experimental in documentation
- **Effort:** M
- **Done When:**
  - Can create multiple memories in one call
  - Can delete multiple memories in one call
  - Validation errors reported per-item
  - Option for atomic mode (all or nothing)
  - Tests cover success, partial failure, total failure scenarios

---

## Batch 3 (Blocked by Batch 2 - Integration)

### Phase 3.1: Integration Testing & Documentation Update
- **Status:** 🔴 Blocked
- **Depends On:** Phase 2.1, Phase 2.2, Phase 2.3
- **Tasks:**
  - [ ] Run full test suite (all batches complete)
  - [ ] Generate updated coverage report
  - [ ] Update README.md with all new features
  - [ ] Update CHANGELOG.md for v0.3.1 or v0.4.0 release
  - [ ] Verify all new tools appear in MCP tool list
  - [ ] Manual testing of new features in Claude Code
  - [ ] Update ARCHITECTURE_ANALYSIS.md to reflect improvements
  - [ ] Create GitHub release notes draft
- **Effort:** S
- **Done When:**
  - All tests passing
  - Coverage report shows improvements
  - Documentation complete and accurate
  - CHANGELOG.md ready for release
  - Manual testing confirms features work in Claude Code

---

## Backlog (Future - Priority 3)

- [ ] Semantic Search with Vector Database Integration (v0.5.0+)
- [ ] Autonomous Memory Management (auto-promotion, auto-tagging, auto-cleanup) (v0.5.0+)
- [ ] Memory Analytics Dashboard (v0.4.0+)
- [ ] Memory relationship traversal (`recallWithRelated`)
- [ ] Server-side indexed search (NATS KV secondary indexes)
- [ ] Content compression (gzip) for large memories
