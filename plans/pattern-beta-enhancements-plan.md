# Pattern Beta Enhancements Implementation Plan

## Summary

Implement Priority 1 (High Value, Low Effort) and Priority 2 (Medium Value/Effort) enhancements to Pattern v0.3.0 to prepare for Beta release. These enhancements improve test coverage, add security features, enhance developer experience, and provide essential backup/query capabilities. Priority 3 items are documented as future vision for post-Beta releases.

## Complexity Assessment

- **Systems affected:** 3 (Storage layer, Tools layer, Documentation)
- **Classification:** Moderate
- **Reasoning:** Multiple independent features with minimal dependencies. Most work is additive (new tools/functions) rather than refactoring. Highest complexity item is batch operations design, but still Medium effort.

## Affected Systems

- Storage layer (`src/storage/`)
- Tools layer (`src/tools/`)
- Documentation (README.md, new security docs)
- Test suite (storage tests, integration tests)

## Dependencies

- **Requires before starting:** None (Pattern v0.3.0 is complete and stable)
- **External services:** NATS JetStream (already in use)
- **Libraries/SDKs:**
  - Existing: `nats`, `zod`, `uuid`, `vitest`
  - No new dependencies required

## Assumptions

- Test infrastructure (vitest, coverage reporting) is working
- NATS test environment is available for integration tests
- Architecture analysis findings (ARCHITECTURE_ANALYSIS.md) are accurate
- No breaking changes to existing API (backward compatible enhancements only)

## Risks

- **Risk 1: Storage coverage improvement may reveal edge case bugs**
  - Mitigation: Treat any discovered bugs as separate issues; don't block enhancement work

- **Risk 2: Content scanning may have false positives (detect non-secrets as secrets)**
  - Mitigation: Start with conservative patterns, make it easy to disable, warnings only (not errors)

- **Risk 3: Batch operations API design might need revision after initial use**
  - Mitigation: Mark as experimental in v0.3.1, allow API changes in v0.4.0

## Batch Execution Plan

### Batch 1 (Parallel - 3 agents)
| Phase | Goal | Effort | Depends On |
|-------|------|--------|------------|
| 1.1 | Improve storage test coverage to 70%+ | M | None |
| 1.2 | Add content scanning for secrets/PII | S | None |
| 1.3 | Document security best practices | S | None |

### Batch 2 (Parallel - 3 agents, after Batch 1)
| Phase | Goal | Effort | Depends On |
|-------|------|--------|------------|
| 2.1 | Add JSON backup/export functionality | M | 1.1 (storage tests stable) |
| 2.2 | Add basic query enhancements (client-side) | M | None |
| 2.3 | Add batch operations (rememberBulk, forgetBulk) | M | None |

### Batch 3 (Sequential - 1 agent, after Batch 2)
| Phase | Goal | Effort | Depends On |
|-------|------|--------|------------|
| 3.1 | Integration testing & documentation update | S | 2.1, 2.2, 2.3 |

## Detailed Phases

### Phase 1.1: Improve Storage Test Coverage
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
- **Files Affected:**
  - `src/storage/nats-kv.test.ts`
  - New file: `src/storage/nats-kv-websocket.test.ts`
  - New file: `src/storage/nats-kv-failure.test.ts`

### Phase 1.2: Add Content Scanning for Secrets/PII
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
- **Files Affected:**
  - New: `src/validation/content-scanner.ts`
  - New: `src/validation/content-scanner.test.ts`
  - Modified: `src/tools/remember.ts` (integrate scanner)
  - Modified: `src/tools/remember.test.ts` (test warning behavior)

### Phase 1.3: Document Security Best Practices
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
- **Files Affected:**
  - New: `docs/SECURITY.md`
  - Modified: `README.md`

### Phase 2.1: Add JSON Backup/Export Functionality
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
- **Files Affected:**
  - New: `src/tools/export-memories.ts`
  - New: `src/tools/export-memories.test.ts`
  - New: `src/tools/import-memories.ts`
  - New: `src/tools/import-memories.test.ts`
  - Modified: `src/tools/index.ts` (register tools)
  - Modified: `README.md` (document tools)

### Phase 2.2: Add Basic Query Enhancements (Client-Side)
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
- **Files Affected:**
  - New: `src/query/filters.ts`
  - New: `src/query/filters.test.ts`
  - New: `src/query/index.ts` (exports)
  - Modified: `src/tools/recall-context.ts` (add optional filter parameters)
  - Modified: `src/tools/recall-context.test.ts` (test filtering)
  - Modified: `README.md` (query examples)

### Phase 2.3: Add Batch Operations
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
- **Files Affected:**
  - New: `src/tools/remember-bulk.ts`
  - New: `src/tools/remember-bulk.test.ts`
  - New: `src/tools/forget-bulk.ts`
  - New: `src/tools/forget-bulk.test.ts`
  - Modified: `src/tools/index.ts` (register tools)
  - Modified: `README.md` (document experimental status)

### Phase 3.1: Integration Testing & Documentation Update
- **Tasks:**
  - [ ] Run full test suite (all batches complete)
  - [ ] Generate updated coverage report
  - [ ] Update README.md with all new features
  - [ ] Update CHANGELOG.md for v0.3.1 release
  - [ ] Verify all new tools appear in MCP tool list
  - [ ] Manual testing of new features in Claude Code
  - [ ] Update ARCHITECTURE_ANALYSIS.md to reflect improvements
  - [ ] Create GitHub release notes draft
- **Effort:** S
- **Done When:**
  - All tests passing
  - Coverage report shows improvements
  - Documentation complete and accurate
  - CHANGELOG.md ready for v0.3.1
  - Manual testing confirms features work in Claude Code
- **Files Affected:**
  - Modified: `README.md`
  - Modified: `CHANGELOG.md`
  - Modified: `ARCHITECTURE_ANALYSIS.md`
  - New: `plans/completed/beta-enhancements-archive.md` (move completed roadmap here)

---

## Critical Path

The longest dependency chain is:

**Path 1**: Phase 1.1 → Phase 2.1 → Phase 3.1 (Storage tests → Backup → Integration)

**Path 2**: Phase 1.2 → Phase 3.1 (Content scanning → Integration)

**Path 3**: Phase 1.3 → Phase 3.1 (Security docs → Integration)

**Path 4**: Phase 2.2 → Phase 3.1 (Query → Integration)

**Path 5**: Phase 2.3 → Phase 3.1 (Batch ops → Integration)

All paths converge at Phase 3.1. Longest path is ~2.5 Medium efforts + 1 Small = approximately 3 work sessions.

## Parallelization Strategy

- **Batch 1**: 3 agents in parallel (independent work)
  - Agent 1: Storage tests (M effort)
  - Agent 2: Content scanning (S effort)
  - Agent 3: Security docs (S effort)

- **Batch 2**: 3 agents in parallel (minimal dependencies)
  - Agent 1: Backup/export (M effort) - depends on 1.1 complete
  - Agent 2: Query enhancements (M effort) - independent
  - Agent 3: Batch operations (M effort) - independent

- **Batch 3**: 1 agent (integration work)
  - Agent 1: Final testing and documentation (S effort)

**Tool-level parallelization**: Each agent should use 3-5 parallel tool calls for:
- Reading multiple files simultaneously
- Running multiple test files in parallel
- Searching for patterns across multiple files

**Expected time reduction**: ~80% vs sequential (3 sessions vs 15+ sessions)

## Stakeholders

- **Michael LoPresti (Product Owner)**: Final approval for Beta release
- **Pattern Users**: Benefit from security features, backup capability, better query
- **Claude Code Integration**: MCP tools must work seamlessly
- **Future Contributors**: Need clear security guidance and good test coverage

## Suggested First Action

Create roadmap.md and kick off Batch 1:

1. **Create `/var/home/mike/source/loominal/pattern/plans/roadmap.md`** with Batch 1 phases
2. **Spawn 3 agents** for parallel execution:
   - **Agent 1 (storage-test-agent)**: Focus on Phase 1.1 (storage coverage)
   - **Agent 2 (security-scan-agent)**: Focus on Phase 1.2 (content scanning)
   - **Agent 3 (security-docs-agent)**: Focus on Phase 1.3 (documentation)
3. **Provide structured delegation** to each agent with:
   - Objective and success criteria
   - Required output format
   - Tool guidance (parallel execution)
   - Task boundaries (what NOT to do)
   - Context (relevant files)

---

## Priority 3: Future Vision (Post-Beta)

These enhancements are documented for future releases (v0.4.0+):

### 7. Semantic Search (v0.5.0+)
- **Description**: Integrate vector database (Pinecone, Weaviate) for semantic queries
- **Features**:
  - Generate embeddings for all memories
  - New tool `recall-similar` for semantic search
  - Hybrid search (semantic + exact filters)
- **Effort**: High (2-3 sprints)
- **Value**: High for large memory stores

### 8. Autonomous Memory Management (v0.5.0+)
- **Description**: LLM-powered auto-management features (opt-in)
- **Features**:
  - Auto-promotion: Identify valuable `recent` → promote to `longterm`
  - Auto-tagging: Generate tags from content
  - Auto-consolidation: Merge related memories
  - Auto-cleanup: Suggest low-value deletions
- **Effort**: High (3-4 sprints)
- **Value**: High for power users with large memory stores

### 9. Memory Analytics Dashboard (v0.4.0+)
- **Description**: Usage insights and health monitoring
- **Features**:
  - Memory growth trends over time
  - Category distribution charts
  - Most-used tags analysis
  - Cleanup recommendations
  - Storage quota warnings
- **Effort**: Medium (1-2 sprints)
- **Value**: Medium (nice-to-have for monitoring)

---

## Version Targeting

- **v0.3.1**: Priority 1 items (Batch 1)
- **v0.3.2 or v0.4.0**: Priority 2 items (Batch 2 + 3)
- **v0.4.0+**: Analytics dashboard
- **v0.5.0+**: Semantic search, autonomous management
