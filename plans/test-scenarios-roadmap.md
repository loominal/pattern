# Pattern v0.4.0 Test Scenario Plan

## Overview

This document provides a comprehensive roadmap for creating test scenarios for Pattern v0.4.0 MCP server. These scenarios are designed to be executed by AI agents in parallel, with clear prompts, success criteria, and independence from each other.

## Project Summary

**Pattern v0.4.0** is an MCP server providing hierarchical memory for AI agents with:
- **13 MCP tools** (9 original + 4 new in v0.4.0)
- **4-scope model**: private, personal, team, public
- **7 categories**: recent, tasks, longterm, core, decisions, architecture, learnings
- **NATS JetStream backend** with multi-bucket KV storage
- **653 unit tests** with 85.08% coverage

## Test Scenario Structure

Each scenario will follow this structure:

```
test-scenarios/XX-scenario-name/
├── README.md          # Scenario description, prompts, success criteria
├── test-script.mjs    # Executable test script (where applicable)
├── fixtures/          # Test data fixtures
└── expected/          # Expected outputs
```

## Roadmap Phases

### Phase 1: Basic Tool Functionality (Batch 1)
**Goal**: Validate core functionality of all 13 MCP tools individually
**Parallelizable**: Yes (7 agents)
**Total Effort**: 7 scenarios × S = 7S

| Scenario | Description | Effort | Dependencies |
|----------|-------------|--------|--------------|
| 01-remember-basic | Test remember tool with all scopes/categories | S | None |
| 02-forget-basic | Test forget tool and core memory protection | S | None |
| 03-recall-context-basic | Test recall-context without filters | S | None |
| 04-task-learning-shortcuts | Test remember-task and remember-learning | S | None |
| 05-lifecycle-tools | Test commit-insight, core-memory, share-learning | S | None |
| 06-export-import-basic | Test export-memories and import-memories | S | None |
| 07-batch-operations-basic | Test remember-bulk and forget-bulk | S | None |

---

### Phase 2: Advanced Features (Batch 2)
**Goal**: Validate v0.4.0 enhancements and edge cases
**Parallelizable**: Yes (5 agents)
**Dependencies**: Phase 1 complete
**Total Effort**: 3S + 2M = 5 units

| Scenario | Description | Effort | Dependencies |
|----------|-------------|--------|--------------|
| 08-recall-filters-tags | Test tag filtering (AND logic) | S | 01, 03 |
| 09-recall-filters-priority | Test priority filtering (min/max) | S | 01, 03 |
| 10-recall-filters-dates | Test date range filtering (created/updated) | S | 01, 03 |
| 11-recall-filters-search | Test content search (case-insensitive) | S | 01, 03 |
| 12-recall-filters-combined | Test multiple filters combined | M | 08-11 |
| 13-export-import-advanced | Test filtering, validation, errors | M | 06 |

---

### Phase 3: Multi-Agent & Isolation (Batch 3)
**Goal**: Validate memory isolation, scope visibility, and sub-agent access
**Parallelizable**: Partial (requires coordination)
**Dependencies**: Phase 1, 2 complete
**Total Effort**: 2S + 2M = 4 units

| Scenario | Description | Effort | Dependencies |
|----------|-------------|--------|--------------|
| 14-scope-isolation-private | Test private scope isolation between agents | M | 01 |
| 15-scope-isolation-team | Test team scope visibility within project | M | 01 |
| 16-scope-personal-cross-project | Test personal scope across projects | S | 01 |
| 17-subagent-access | Test sub-agent memory access rules | S | 01, 05 |

---

### Phase 4: Data Integrity & TTL (Batch 4)
**Goal**: Validate TTL expiration, content scanning, metadata preservation
**Parallelizable**: Yes (5 agents)
**Dependencies**: Phase 1 complete
**Total Effort**: 4S + 1M = 5 units

| Scenario | Description | Effort | Dependencies |
|----------|-------------|--------|--------------|
| 18-ttl-expiration | Test recent/tasks category TTL (24h) | M | 01, 04 |
| 19-content-scanning | Test secret/PII detection warnings | S | 01 |
| 20-metadata-preservation | Test tags, priority, timestamps preservation | S | 01 |
| 21-scope-category-validation | Test invalid scope/category combinations | S | 01 |
| 22-storage-limits | Test memory count limits per scope | S | 01 |

---

### Phase 5: Performance & Scale (Batch 5)
**Goal**: Validate performance with large datasets and concurrent operations
**Parallelizable**: Yes (3 agents)
**Dependencies**: Phase 1 complete
**Total Effort**: 1S + 2M = 3 units

| Scenario | Description | Effort | Dependencies |
|----------|-------------|--------|--------------|
| 23-large-memory-sets | Test with 1000+ memories per scope | M | 01, 03 |
| 24-bulk-operation-performance | Test bulk ops with 100+ items | M | 07 |
| 25-concurrent-operations | Test concurrent remember/forget/recall | S | 01, 02, 03 |

---

### Phase 6: Integration & Transport (Batch 6)
**Goal**: Validate NATS connection variants, authentication, bucket management
**Parallelizable**: Yes (4 agents)
**Dependencies**: None (infrastructure level)
**Total Effort**: 4S = 4 units

| Scenario | Description | Effort | Dependencies |
|----------|-------------|--------|--------------|
| 26-nats-tcp-transport | Test TCP transport (nats://, tls://) | S | None |
| 27-nats-websocket-transport | Test WebSocket transport (ws://, wss://) | S | None |
| 28-nats-authentication | Test URL credentials and env vars | S | None |
| 29-bucket-management | Test multi-bucket routing (project/user/global) | S | None |

---

### Phase 7: Error Handling (Batch 7)
**Goal**: Validate error conditions and edge cases
**Parallelizable**: Yes (5 agents)
**Dependencies**: Phase 1 complete
**Total Effort**: 5S = 5 units

| Scenario | Description | Effort | Dependencies |
|----------|-------------|--------|--------------|
| 30-invalid-inputs | Test tool calls with invalid parameters | S | All tools |
| 31-missing-memories | Test operations on non-existent memory IDs | S | 02, 05, 06 |
| 32-connection-failures | Test NATS connection loss and recovery | S | None |
| 33-access-control | Test unauthorized access to team/public memories | S | 14, 15 |
| 34-batch-partial-failures | Test bulk ops with mixed valid/invalid data | S | 07 |

---

## Detailed Scenario Specifications

### Scenario 01: Basic Remember Tool

**Directory**: `test-scenarios/01-remember-basic/`

**Description**: Validate the `remember` tool with all scope/category combinations, metadata, and content storage.

**Agent Prompt**:
```
Create a test scenario that validates the Pattern MCP server's `remember` tool.

Test the following:
1. Store memories with all 4 scopes (private, personal, team, public)
2. Store memories in all 7 categories (recent, tasks, longterm, core, decisions, architecture, learnings)
3. Validate scope/category combinations (private can use recent/tasks/longterm, team can use decisions/architecture/learnings, etc.)
4. Store memories with metadata (tags, priority, source)
5. Verify memory IDs are returned (UUIDs)
6. Verify timestamps are set (createdAt, updatedAt)
7. Retrieve stored memories with recall-context to verify content

Create a test script (test-script.mjs) that:
- Connects to Pattern MCP server
- Calls remember with various combinations
- Validates responses
- Cleans up memories after test

Success criteria: All remember calls succeed with correct scope/category, metadata is preserved, memories are retrievable.
```

**Expected Behavior**:
- ✅ Private scope accepts categories: recent, tasks, longterm
- ✅ Personal scope accepts category: core
- ✅ Team scope accepts categories: decisions, architecture, learnings
- ✅ Public scope accepts categories: decisions, architecture, learnings
- ✅ Metadata (tags, priority) is preserved
- ✅ Memory IDs are valid UUIDs
- ✅ Timestamps are set correctly

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] All 20+ remember calls succeed
- [ ] Invalid scope/category combinations are rejected
- [ ] Metadata is preserved exactly as provided
- [ ] All memories are retrievable with recall-context
- [ ] Cleanup removes all test memories

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget for all created memory IDs
2. Verify memories are deleted with recall-context

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/test-memories.json` - Sample memory data

**Effort**: S (2-3 hours)

---

### Scenario 02: Basic Forget Tool

**Directory**: `test-scenarios/02-forget-basic/`

**Description**: Validate the `forget` tool, including core memory protection and error handling.

**Agent Prompt**:
```
Create a test scenario that validates the Pattern MCP server's `forget` tool.

Test the following:
1. Delete memories from all 4 scopes (private, personal, team, public)
2. Verify core memories require force=true flag
3. Test access control (can only delete own memories)
4. Test forgetting non-existent memory IDs (should error)
5. Verify forgotten memories are no longer retrievable

Create a test script (test-script.mjs) that:
- Creates test memories using remember
- Deletes memories with forget
- Attempts to delete core memory without force flag (should fail)
- Deletes core memory with force=true (should succeed)
- Verifies memories are gone with recall-context

Success criteria: All forget operations work correctly, core memory protection works, deleted memories are not retrievable.
```

**Expected Behavior**:
- ✅ forget succeeds for private/team/public memories
- ✅ forget fails for core memories without force=true
- ✅ forget succeeds for core memories with force=true
- ✅ forget fails for non-existent memory IDs
- ✅ Forgotten memories are not returned by recall-context

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] All 10+ forget calls behave as expected
- [ ] Core memory protection enforced
- [ ] Error messages are clear and helpful
- [ ] Deleted memories are confirmed gone

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. All test memories are deleted as part of test

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK

**Effort**: S (2-3 hours)

---

### Scenario 03: Basic Recall Context

**Directory**: `test-scenarios/03-recall-context-basic/`

**Description**: Validate the `recall-context` tool without advanced filters (v0.4.0 features tested separately).

**Agent Prompt**:
```
Create a test scenario that validates the Pattern MCP server's `recall-context` tool (basic functionality only, no filters).

Test the following:
1. Recall memories from all 4 scopes (private, personal, team, public)
2. Filter by scopes parameter (e.g., ["private", "team"])
3. Filter by categories parameter (e.g., ["longterm", "decisions"])
4. Test limit parameter (default 50, max 200)
5. Test since parameter (ISO 8601 timestamp)
6. Verify summary is generated (4KB max)
7. Verify counts object is returned
8. Verify memories are grouped by scope

Create a test script that:
- Creates 100+ test memories across all scopes/categories
- Calls recall-context with various filters
- Validates response structure
- Verifies filtering logic works correctly

Success criteria: All recall operations return correct memories, filtering works, summary is generated, counts are accurate.
```

**Expected Behavior**:
- ✅ Returns memories grouped by scope (private, personal, team, public)
- ✅ Filtering by scopes works correctly
- ✅ Filtering by categories works correctly
- ✅ limit parameter respected (default 50, max 200)
- ✅ since parameter filters by updatedAt timestamp
- ✅ Summary is generated (max 4KB)
- ✅ Counts object shows totals per scope + expired count

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] All 15+ recall-context calls succeed
- [ ] Filtering logic validated
- [ ] Summary is generated and under 4KB
- [ ] Counts are accurate
- [ ] Response structure matches documentation

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget-bulk for all created memory IDs

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/large-memory-set.json` - 100+ test memories

**Effort**: S (2-3 hours)

---

### Scenario 04: Task and Learning Shortcuts

**Directory**: `test-scenarios/04-task-learning-shortcuts/`

**Description**: Validate `remember-task` and `remember-learning` shorthand tools.

**Agent Prompt**:
```
Create a test scenario that validates the Pattern MCP server's shorthand tools: remember-task and remember-learning.

Test the following:
1. remember-task creates memory with scope=private, category=tasks, 24h TTL
2. remember-learning creates memory with scope=private, category=recent, 24h TTL
3. Both accept metadata (tags, priority, source)
4. Both return memory IDs
5. Memories are retrievable with recall-context
6. TTL metadata is set correctly (expiresAt = createdAt + 24h)

Create a test script that:
- Calls remember-task with task content
- Calls remember-learning with learning content
- Verifies scope/category/TTL are correct
- Retrieves memories with recall-context
- Validates expiresAt timestamp

Success criteria: Both tools work correctly, TTL is set to 24h, memories are categorized correctly.
```

**Expected Behavior**:
- ✅ remember-task creates private/tasks memory with 24h TTL
- ✅ remember-learning creates private/recent memory with 24h TTL
- ✅ Metadata is preserved
- ✅ Memory IDs are returned
- ✅ TTL timestamp is approximately 24h from creation

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ calls to each tool succeed
- [ ] Scope/category/TTL verified
- [ ] Metadata preserved
- [ ] Memories retrievable with recall-context

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget for all created memory IDs

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK

**Effort**: S (2 hours)

---

### Scenario 05: Lifecycle Tools

**Directory**: `test-scenarios/05-lifecycle-tools/`

**Description**: Validate `commit-insight`, `core-memory`, and `share-learning` tools.

**Agent Prompt**:
```
Create a test scenario that validates Pattern MCP server lifecycle tools: commit-insight, core-memory, and share-learning.

Test commit-insight:
1. Create temporary memory (remember-learning)
2. Promote to longterm with commit-insight
3. Verify category changed from recent to longterm
4. Verify TTL removed (expiresAt is null)
5. Test updating content during promotion

Test core-memory:
1. Create core memory (scope=personal, category=core)
2. Verify max 100 core memories per agent
3. Verify core memories require force=true to delete
4. Verify core memories have no TTL

Test share-learning:
1. Create private memory (scope=private)
2. Share to team with share-learning
3. Verify scope changed to team
4. Verify category changed to learnings (or decisions/architecture)
5. Test keepOriginal=false (original deleted)
6. Test keepOriginal=true (original preserved)

Success criteria: All lifecycle operations work correctly, validation enforced, scope/category changes verified.
```

**Expected Behavior**:
- ✅ commit-insight promotes recent/tasks to longterm
- ✅ commit-insight removes TTL
- ✅ commit-insight can update content
- ✅ core-memory creates personal/core memory
- ✅ core-memory enforces 100 memory limit
- ✅ share-learning moves memory to team scope
- ✅ share-learning changes category to learnings (or specified)
- ✅ keepOriginal flag works correctly

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ lifecycle operations succeed
- [ ] All validations enforced
- [ ] Scope/category transitions verified
- [ ] TTL handling correct
- [ ] keepOriginal flag works as expected

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget with force=true for core memories
2. Call forget for all other test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK

**Effort**: S (3 hours)

---

### Scenario 06: Basic Export/Import

**Directory**: `test-scenarios/06-export-import-basic/`

**Description**: Validate `export-memories` and `import-memories` tools for backup/restore workflows.

**Agent Prompt**:
```
Create a test scenario that validates Pattern MCP server's export-memories and import-memories tools.

Test export-memories:
1. Create 50+ memories across all scopes/categories
2. Export all memories (no filters)
3. Export filtered by scope (e.g., scope=private)
4. Export filtered by category (e.g., category=longterm)
5. Export with since parameter (date filter)
6. Export with includeExpired=true
7. Verify JSON format (version 1.0)
8. Verify exported count matches
9. Verify file size is reported

Test import-memories:
1. Import from export file
2. Verify imported count matches exported
3. Test overwriteExisting=false (skip duplicates)
4. Test overwriteExisting=true (replace duplicates)
5. Test skipInvalid=true (continue on errors)
6. Test skipInvalid=false (fail fast)
7. Verify all metadata preserved (tags, priority, timestamps)
8. Verify TTL preserved for recent/tasks categories

Success criteria: Export/import round-trip preserves all data, filtering works, error handling works.
```

**Expected Behavior**:
- ✅ export-memories creates valid JSON file
- ✅ export-memories filters work correctly
- ✅ export-memories reports count and file size
- ✅ import-memories validates JSON structure
- ✅ import-memories preserves all metadata
- ✅ import-memories handles duplicates correctly
- ✅ import-memories handles invalid data per skipInvalid flag

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ export operations succeed
- [ ] 10+ import operations succeed
- [ ] Round-trip preserves all data exactly
- [ ] Filtering validated
- [ ] Error handling validated
- [ ] overwriteExisting flag works
- [ ] skipInvalid flag works

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Temporary directory for export files

**Cleanup Steps**:
1. Delete all test memories
2. Delete all export files

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/valid-export.json` - Valid export file for testing
- `fixtures/invalid-export.json` - Invalid export file for error testing

**Effort**: S (3 hours)

---

### Scenario 07: Basic Batch Operations

**Directory**: `test-scenarios/07-batch-operations-basic/`

**Description**: Validate `remember-bulk` and `forget-bulk` tools for batch processing.

**Agent Prompt**:
```
Create a test scenario that validates Pattern MCP server's batch operation tools: remember-bulk and forget-bulk.

Test remember-bulk:
1. Store 50+ memories at once with validate=true
2. Test stopOnError=false (continue on errors)
3. Test stopOnError=true (stop on first error)
4. Test validate=true (pre-flight validation)
5. Test validate=false (validate during storage)
6. Verify stored count is accurate
7. Verify failed count is accurate
8. Verify error messages include array indices
9. Verify memoryIds are returned for stored memories
10. Test mixed valid/invalid data

Test forget-bulk:
1. Delete 50+ memories at once
2. Test stopOnError=false (continue on errors)
3. Test stopOnError=true (stop on first error)
4. Test force=false (core memory protection)
5. Test force=true (delete core memories)
6. Verify deleted count is accurate
7. Verify failed count is accurate
8. Verify error messages include memory IDs
9. Test mixed existing/non-existent IDs

Success criteria: Batch operations work correctly, error handling is granular, counts are accurate.
```

**Expected Behavior**:
- ✅ remember-bulk stores multiple memories efficiently
- ✅ remember-bulk validates before storing (when validate=true)
- ✅ remember-bulk reports errors with array indices
- ✅ remember-bulk stopOnError flag works correctly
- ✅ forget-bulk deletes multiple memories efficiently
- ✅ forget-bulk enforces core memory protection
- ✅ forget-bulk reports errors with memory IDs
- ✅ forget-bulk stopOnError flag works correctly

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ remember-bulk calls succeed
- [ ] 10+ forget-bulk calls succeed
- [ ] Error handling validated
- [ ] Counts are accurate
- [ ] Non-atomic behavior documented (partial success)
- [ ] force flag works for core memories

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget-bulk for any remaining test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/bulk-memories.json` - 50+ memories for testing
- `fixtures/invalid-bulk-memories.json` - Mixed valid/invalid for error testing

**Effort**: S (3 hours)

---

### Scenario 08: Recall Filters - Tags

**Directory**: `test-scenarios/08-recall-filters-tags/`

**Description**: Validate tag filtering in `recall-context` (v0.4.0 feature, AND logic).

**Agent Prompt**:
```
Create a test scenario that validates the recall-context tool's tag filtering feature (v0.4.0).

Test the following:
1. Create memories with various tag combinations:
   - Memory 1: tags=["api", "documentation"]
   - Memory 2: tags=["api", "authentication"]
   - Memory 3: tags=["api", "documentation", "rest"]
   - Memory 4: tags=["database", "postgresql"]
   - Memory 5: tags=[]
2. Filter by single tag (tags=["api"]) - should return memories 1, 2, 3
3. Filter by multiple tags (tags=["api", "documentation"]) - should return memories 1, 3 (AND logic)
4. Filter by non-existent tag (tags=["nonexistent"]) - should return empty
5. Filter by empty array (tags=[]) - should return all memories
6. Verify AND logic (memory must have ALL specified tags)

Create a test script that:
- Creates 20+ memories with diverse tag combinations
- Tests various tag filter queries
- Validates AND logic is enforced
- Verifies empty filter returns all memories

Success criteria: Tag filtering works correctly with AND logic, edge cases handled.
```

**Expected Behavior**:
- ✅ Tag filtering uses AND logic (must have all tags)
- ✅ Empty tag filter returns all memories
- ✅ Single tag filter works correctly
- ✅ Multiple tag filter requires all tags present
- ✅ Non-existent tags return empty results

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ tag filter queries succeed
- [ ] AND logic validated with multiple test cases
- [ ] Edge cases handled (empty tags, no matches)
- [ ] Documentation updated if behavior differs

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget-bulk for all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/tagged-memories.json` - Memories with diverse tag combinations

**Effort**: S (2 hours)

**Dependencies**: Scenarios 01, 03 complete

---

### Scenario 09: Recall Filters - Priority

**Directory**: `test-scenarios/09-recall-filters-priority/`

**Description**: Validate priority filtering in `recall-context` (v0.4.0 feature, min/max range).

**Agent Prompt**:
```
Create a test scenario that validates the recall-context tool's priority filtering feature (v0.4.0).

Test the following:
1. Create memories with various priorities:
   - 5 memories with priority=1 (high)
   - 5 memories with priority=2 (medium)
   - 5 memories with priority=3 (low)
   - 5 memories with no priority metadata (default to 2)
2. Filter by minPriority=1 (should return all)
3. Filter by maxPriority=1 (should return only high priority)
4. Filter by minPriority=2, maxPriority=2 (should return medium priority + no metadata)
5. Filter by minPriority=1, maxPriority=2 (should return high + medium + no metadata)
6. Test edge case: minPriority=3, maxPriority=1 (invalid, should return empty or error)

Create a test script that:
- Creates 20+ memories with diverse priorities
- Tests various priority filter combinations
- Validates default priority=2 for memories without metadata
- Verifies range filtering works correctly

Success criteria: Priority filtering works correctly, defaults are applied, range logic is correct.
```

**Expected Behavior**:
- ✅ minPriority filters correctly (>=)
- ✅ maxPriority filters correctly (<=)
- ✅ Memories without priority default to 2
- ✅ Range filtering works (min + max combined)
- ✅ Invalid ranges handled gracefully

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ priority filter queries succeed
- [ ] Default priority=2 validated
- [ ] Range logic validated
- [ ] Edge cases handled

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget-bulk for all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/prioritized-memories.json` - Memories with diverse priorities

**Effort**: S (2 hours)

**Dependencies**: Scenarios 01, 03 complete

---

### Scenario 10: Recall Filters - Dates

**Directory**: `test-scenarios/10-recall-filters-dates/`

**Description**: Validate date range filtering in `recall-context` (v0.4.0 feature, created/updated).

**Agent Prompt**:
```
Create a test scenario that validates the recall-context tool's date range filtering feature (v0.4.0).

Test the following:
1. Create memories at different times (use sleep or modify timestamps):
   - 5 memories created on Day 1
   - 5 memories created on Day 2
   - 5 memories created on Day 3
2. Update some memories to have different updatedAt timestamps
3. Filter by createdAfter (memories created after specific date)
4. Filter by createdBefore (memories created before specific date)
5. Filter by updatedAfter (memories updated after specific date)
6. Filter by updatedBefore (memories updated before specific date)
7. Combine created and updated filters
8. Test edge cases (exact timestamps, future dates)

Create a test script that:
- Creates 20+ memories with controlled timestamps
- Tests various date range filter combinations
- Validates ISO 8601 timestamp format
- Verifies inclusive/exclusive boundary behavior

Success criteria: Date filtering works correctly, created/updated filters independent, edge cases handled.
```

**Expected Behavior**:
- ✅ createdAfter filters by createdAt timestamp
- ✅ createdBefore filters by createdAt timestamp
- ✅ updatedAfter filters by updatedAt timestamp
- ✅ updatedBefore filters by updatedAt timestamp
- ✅ Filters can be combined
- ✅ ISO 8601 format required
- ✅ Edge cases handled gracefully

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ date filter queries succeed
- [ ] Created vs updated filtering validated independently
- [ ] Combined filters work correctly
- [ ] Edge cases handled (future dates, exact matches)

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget-bulk for all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/timestamped-memories.json` - Memories with controlled timestamps

**Effort**: S (2-3 hours)

**Dependencies**: Scenarios 01, 03 complete

---

### Scenario 11: Recall Filters - Search

**Directory**: `test-scenarios/11-recall-filters-search/`

**Description**: Validate content search in `recall-context` (v0.4.0 feature, case-insensitive).

**Agent Prompt**:
```
Create a test scenario that validates the recall-context tool's content search feature (v0.4.0).

Test the following:
1. Create memories with diverse content:
   - Memory 1: "The API uses REST architecture"
   - Memory 2: "The api documentation is incomplete"
   - Memory 3: "Database uses PostgreSQL"
   - Memory 4: "Authentication uses JWT tokens"
   - Memory 5: "The REST API has rate limiting"
2. Search for "api" (case-insensitive) - should return memories 1, 2, 5
3. Search for "REST" (case-insensitive) - should return memories 1, 5
4. Search for "postgresql" (case-insensitive) - should return memory 3
5. Search for "nonexistent" - should return empty
6. Search for empty string - should return all memories
7. Test special characters in search query
8. Test partial word matching

Create a test script that:
- Creates 20+ memories with diverse content
- Tests various search queries
- Validates case-insensitive matching
- Verifies partial matching behavior

Success criteria: Content search works correctly, case-insensitive, handles edge cases.
```

**Expected Behavior**:
- ✅ Search is case-insensitive
- ✅ Search matches partial content
- ✅ Empty search returns all memories
- ✅ Non-matching search returns empty
- ✅ Special characters handled correctly

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ search queries succeed
- [ ] Case-insensitive matching validated
- [ ] Partial matching behavior documented
- [ ] Edge cases handled

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget-bulk for all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/searchable-memories.json` - Memories with diverse searchable content

**Effort**: S (2 hours)

**Dependencies**: Scenarios 01, 03 complete

---

### Scenario 12: Recall Filters - Combined

**Directory**: `test-scenarios/12-recall-filters-combined/`

**Description**: Validate combining multiple filters in `recall-context` (v0.4.0 feature, AND logic).

**Agent Prompt**:
```
Create a test scenario that validates the recall-context tool's ability to combine multiple filters (v0.4.0).

Test the following combinations:
1. tags + priority (e.g., tags=["api"] AND maxPriority=1)
2. tags + date range (e.g., tags=["api"] AND createdAfter="2025-01-01")
3. priority + date range (e.g., minPriority=1 AND updatedAfter="2025-01-15")
4. tags + priority + date range (all three combined)
5. tags + search (e.g., tags=["api"] AND search="REST")
6. All filters combined (tags + priority + dates + search + scopes + categories)
7. Verify AND logic across all filters
8. Test realistic use cases (e.g., "Find high-priority API docs created this month")

Create a test script that:
- Creates 50+ memories with diverse attributes
- Tests 10+ filter combinations
- Validates AND logic is enforced across all filters
- Tests realistic query scenarios

Success criteria: All filters can be combined, AND logic enforced, realistic queries work.
```

**Expected Behavior**:
- ✅ All filters can be combined
- ✅ AND logic applies across all filters
- ✅ Memories must match ALL specified filters
- ✅ Empty/unspecified filters are ignored
- ✅ Realistic queries return expected results

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ combined filter queries succeed
- [ ] AND logic validated with complex queries
- [ ] Realistic use cases documented
- [ ] Performance acceptable with all filters

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Call forget-bulk for all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/complex-memories.json` - Memories with all attributes
- `expected/query-results.json` - Expected results for realistic queries

**Effort**: M (4-5 hours)

**Dependencies**: Scenarios 08, 09, 10, 11 complete

---

### Scenario 13: Export/Import Advanced

**Directory**: `test-scenarios/13-export-import-advanced/`

**Description**: Validate advanced export/import features including filtering, validation, and error handling.

**Agent Prompt**:
```
Create a test scenario that validates advanced export/import features in Pattern MCP server.

Test export-memories advanced features:
1. Export with multiple filters combined (scope + category + since)
2. Export expired memories (includeExpired=true)
3. Export large datasets (1000+ memories)
4. Export to custom file paths (absolute, relative)
5. Verify JSON format version compatibility
6. Test concurrent exports

Test import-memories advanced features:
1. Import with overwriteExisting=true (replace duplicates)
2. Import with skipInvalid=false (fail fast on errors)
3. Import corrupted JSON files (invalid format)
4. Import files with invalid memory structures
5. Import files with unsupported versions
6. Import large datasets (1000+ memories)
7. Test partial failures (some memories valid, some invalid)

Test backup/restore workflows:
1. Full backup (export all memories)
2. Full restore (import all memories)
3. Selective backup (export specific scope/category)
4. Incremental backup (export since last backup timestamp)
5. Disaster recovery (wipe all memories, restore from backup)

Success criteria: Advanced features work, validation is thorough, error handling is robust.
```

**Expected Behavior**:
- ✅ Export filters work correctly when combined
- ✅ includeExpired flag works
- ✅ Large datasets handled efficiently
- ✅ Custom file paths work (absolute, relative)
- ✅ Import validation catches all error types
- ✅ overwriteExisting works correctly
- ✅ skipInvalid controls error handling
- ✅ Backup/restore workflows successful

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 20+ advanced export/import operations succeed
- [ ] All validation errors caught and reported
- [ ] Large datasets handled (1000+ memories)
- [ ] Backup/restore workflows validated
- [ ] Partial failures handled gracefully
- [ ] Error messages are clear and actionable

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Sufficient disk space for large exports

**Cleanup Steps**:
1. Delete all test memories
2. Delete all export files

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test using MCP SDK
- `fixtures/large-dataset.json` - 1000+ memories
- `fixtures/corrupted-export.json` - Invalid JSON for testing
- `fixtures/invalid-structure.json` - Valid JSON, invalid memory structure
- `fixtures/unsupported-version.json` - Unsupported export version

**Effort**: M (5-6 hours)

**Dependencies**: Scenario 06 complete

---

### Scenario 14: Scope Isolation - Private

**Directory**: `test-scenarios/14-scope-isolation-private/`

**Description**: Validate that private scope memories are isolated between agents.

**Agent Prompt**:
```
Create a test scenario that validates private scope memory isolation between agents.

This test requires simulating multiple agents (different agent IDs):
1. Agent A creates private scope memories
2. Agent B creates private scope memories
3. Agent A recalls memories - should only see own private memories
4. Agent B recalls memories - should only see own private memories
5. Verify Agent A cannot access Agent B's private memories
6. Verify Agent B cannot access Agent A's private memories
7. Test forget access control (Agent A cannot delete Agent B's memories)

To simulate multiple agents, you'll need to:
- Use different LOOMINAL_AGENT_ID environment variables, OR
- Use different project directories (since agent ID is derived from hostname + project path)

Create a test script that:
- Sets up two agent identities
- Creates memories as each agent
- Validates isolation via recall-context
- Attempts cross-agent access (should fail)

Success criteria: Private memories are completely isolated, no cross-agent access possible.
```

**Expected Behavior**:
- ✅ Agent A's private memories not visible to Agent B
- ✅ Agent B's private memories not visible to Agent A
- ✅ recall-context only returns own private memories
- ✅ forget fails when attempting to delete other agent's private memories
- ✅ Team/public scope memories are visible to both (not isolated)

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ isolation tests pass
- [ ] Cross-agent access attempts fail correctly
- [ ] Error messages are clear
- [ ] Team/public scope still shared correctly

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running (multiple instances or identity override)
- Node.js >= 18.0.0
- Ability to simulate multiple agent identities

**Cleanup Steps**:
1. Delete all test memories from both agents

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with multi-agent simulation
- `setup-agent-a.sh` - Shell script to launch agent A
- `setup-agent-b.sh` - Shell script to launch agent B

**Effort**: M (5-6 hours, includes multi-agent setup)

**Dependencies**: Scenario 01 complete

---

### Scenario 15: Scope Isolation - Team

**Directory**: `test-scenarios/15-scope-isolation-team/`

**Description**: Validate that team scope memories are visible within project but isolated between projects.

**Agent Prompt**:
```
Create a test scenario that validates team scope memory visibility and isolation.

Test within-project visibility:
1. Agent A (Project X) creates team scope memories
2. Agent B (Project X) can see Agent A's team memories via recall-context
3. Agent B (Project X) can create team memories visible to Agent A

Test cross-project isolation:
1. Agent C (Project Y) creates team scope memories
2. Agent A (Project X) cannot see Agent C's team memories
3. Agent C (Project Y) cannot see Agent A's team memories
4. Verify project isolation is based on LOOMINAL_PROJECT_ID

To simulate multiple projects:
- Use different LOOMINAL_PROJECT_ID environment variables, OR
- Use different project directories

Create a test script that:
- Sets up agents in two different projects
- Creates team memories in each project
- Validates within-project visibility
- Validates cross-project isolation

Success criteria: Team memories are shared within project, isolated between projects.
```

**Expected Behavior**:
- ✅ Team memories visible to all agents in same project
- ✅ Team memories invisible to agents in different projects
- ✅ recall-context returns team memories from current project only
- ✅ forget works for team memories created by self
- ✅ forget fails for team memories created by others (access control)

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ visibility tests pass
- [ ] Within-project sharing validated
- [ ] Cross-project isolation validated
- [ ] Access control for forget validated

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running (multiple instances with different project IDs)
- Node.js >= 18.0.0
- Ability to simulate multiple projects

**Cleanup Steps**:
1. Delete all test memories from both projects

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with multi-project simulation
- `setup-project-x.sh` - Shell script to launch Project X agents
- `setup-project-y.sh` - Shell script to launch Project Y agents

**Effort**: M (5-6 hours, includes multi-project setup)

**Dependencies**: Scenario 01 complete

---

### Scenario 16: Personal Scope Cross-Project

**Directory**: `test-scenarios/16-scope-personal-cross-project/`

**Description**: Validate that personal scope (core memories) follow the agent across projects.

**Agent Prompt**:
```
Create a test scenario that validates personal scope memory behavior across projects.

Test cross-project visibility:
1. Agent A (Project X) creates core memory (scope=personal, category=core)
2. Agent A switches to Project Y
3. Agent A recalls memories - should see core memory from Project X
4. Verify core memories stored in user bucket (not project bucket)
5. Verify core memory follows agent across all projects
6. Verify max 100 core memories enforced globally (not per-project)

Test access control:
1. Agent A (Project X) creates core memory
2. Agent B (any project) cannot see Agent A's core memory (personal scope)
3. Verify core memories are agent-specific, not shared

To simulate project switching:
- Use different LOOMINAL_PROJECT_ID values for same agent identity

Create a test script that:
- Creates core memory in Project X
- Switches to Project Y (same agent)
- Verifies core memory is accessible
- Tests access control (different agent)

Success criteria: Core memories follow agent across projects, remain personal (not shared).
```

**Expected Behavior**:
- ✅ Core memories accessible from all projects (same agent)
- ✅ Core memories stored in user bucket (not project bucket)
- ✅ Core memories not visible to other agents (personal scope)
- ✅ Max 100 core memories enforced globally
- ✅ Core memory deletion requires force=true

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ cross-project tests pass
- [ ] Core memories follow agent correctly
- [ ] Access control validated
- [ ] Storage bucket routing validated (user bucket)

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running (same agent, different projects)
- Node.js >= 18.0.0
- Ability to simulate project switching

**Cleanup Steps**:
1. Delete all core memories with force=true

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with project switching
- `setup-agent.sh` - Shell script to launch agent with project switching

**Effort**: S (3-4 hours)

**Dependencies**: Scenario 01, 05 complete

---

### Scenario 17: Sub-Agent Access

**Directory**: `test-scenarios/17-subagent-access/`

**Description**: Validate sub-agent memory access rules according to Pattern documentation.

**Agent Prompt**:
```
Create a test scenario that validates sub-agent memory access rules.

Per Pattern README, sub-agents have the following access to parent memories:
- Private (recent, tasks, longterm): Read access
- Personal (core): No access (protected)
- Team: Full read/write
- Public: Full read/write

Test setup:
1. Root agent creates memories in all scopes/categories
2. Sub-agent (spawned with LOOMINAL_SUBAGENT_TYPE set) attempts to access memories

Test sub-agent read access:
1. Sub-agent reads parent's private/recent memories (should succeed)
2. Sub-agent reads parent's private/tasks memories (should succeed)
3. Sub-agent reads parent's private/longterm memories (should succeed)
4. Sub-agent reads parent's personal/core memories (should FAIL - protected)
5. Sub-agent reads parent's team memories (should succeed)
6. Sub-agent reads parent's public memories (should succeed)

Test sub-agent write access:
1. Sub-agent creates own private memories (should succeed)
2. Sub-agent creates team memories (should succeed)
3. Sub-agent creates public memories (should succeed)
4. Sub-agent cannot modify parent's private memories
5. Sub-agent can modify team/public memories (if they created them)

To simulate sub-agent:
- Set LOOMINAL_SUBAGENT_TYPE environment variable when launching Pattern

Success criteria: Sub-agent access rules enforced exactly as documented.
```

**Expected Behavior**:
- ✅ Sub-agent can read parent's private (recent, tasks, longterm)
- ✅ Sub-agent CANNOT read parent's core memories
- ✅ Sub-agent has full access to team/public
- ✅ Sub-agent can create own memories
- ✅ Sub-agent cannot modify parent's private memories

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ access control tests pass
- [ ] Read access rules validated
- [ ] Write access rules validated
- [ ] Core memory protection validated
- [ ] Sub-agent type detection works

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running (root + sub-agent)
- Node.js >= 18.0.0
- Ability to set LOOMINAL_SUBAGENT_TYPE

**Cleanup Steps**:
1. Delete all test memories from both root and sub-agent

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with sub-agent simulation
- `setup-root-agent.sh` - Shell script to launch root agent
- `setup-subagent.sh` - Shell script to launch sub-agent

**Effort**: S (3-4 hours)

**Dependencies**: Scenario 01, 05 complete

---

### Scenario 18: TTL Expiration

**Directory**: `test-scenarios/18-ttl-expiration/`

**Description**: Validate TTL expiration for recent/tasks categories (24h).

**Agent Prompt**:
```
Create a test scenario that validates TTL expiration behavior in Pattern MCP server.

Test TTL metadata:
1. Create recent category memory (24h TTL)
2. Create tasks category memory (24h TTL)
3. Verify expiresAt timestamp is set (createdAt + 24h)
4. Verify longterm category has no TTL (expiresAt is null)
5. Verify core category has no TTL (expiresAt is null)

Test cleanup tool:
1. Create expired memories (modify expiresAt timestamp manually if possible)
2. Call cleanup tool with expireOnly=true
3. Verify expired memories are deleted
4. Verify non-expired memories remain
5. Call cleanup tool with expireOnly=false (also enforces limits)

Test recall-context with expired memories:
1. Create expired memories
2. Call recall-context - expired memories should not be returned
3. Verify counts.expired shows count of expired memories

Note: Since TTL is 24h, you may need to:
- Mock the current time, OR
- Create memories with past expiresAt timestamps, OR
- Modify cleanup logic to accept custom "current time" for testing

Success criteria: TTL expiration works correctly, cleanup removes expired memories.
```

**Expected Behavior**:
- ✅ recent/tasks categories have expiresAt = createdAt + 24h
- ✅ longterm/core categories have expiresAt = null
- ✅ cleanup tool removes expired memories
- ✅ recall-context excludes expired memories
- ✅ counts.expired shows count of expired memories
- ✅ Non-expired memories are preserved

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ TTL tests pass
- [ ] expiresAt timestamps validated
- [ ] cleanup tool works correctly
- [ ] Expired memories excluded from recall
- [ ] counts.expired is accurate

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Ability to test TTL (time mocking or manual timestamp manipulation)

**Cleanup Steps**:
1. Call cleanup to remove all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with TTL validation
- `fixtures/expired-memories.json` - Memories with past expiresAt timestamps

**Effort**: M (4-5 hours, includes time handling complexity)

**Dependencies**: Scenario 01, 04 complete

---

### Scenario 19: Content Scanning

**Directory**: `test-scenarios/19-content-scanning/`

**Description**: Validate content scanning for secrets/PII detection (v0.3.1 feature).

**Agent Prompt**:
```
Create a test scenario that validates Pattern's content scanning feature (v0.3.1).

Test secret detection:
1. Create memory with API key pattern (e.g., "sk_live_abc123...")
2. Verify warning is logged (non-blocking)
3. Verify memory is still stored (warnings don't prevent storage)
4. Test AWS key pattern (AKIA...)
5. Test GitHub token pattern (ghp_...)
6. Test JWT token pattern
7. Test password patterns
8. Test private key patterns (-----BEGIN RSA PRIVATE KEY-----)

Test PII detection:
1. Create memory with email address
2. Create memory with credit card number
3. Create memory with SSN pattern
4. Verify warnings are logged
5. Verify memories are stored

Test opt-out:
1. Set PATTERN_CONTENT_SCANNING=false
2. Create memory with secrets
3. Verify no warnings are logged
4. Re-enable scanning (unset or set to true)

Test redaction in warnings:
1. Create memory with secret "sk_live_1234567890abcdefghijklmnopqrstuvwxyz"
2. Verify warning shows "sk_...xyz" (first 3 + last 3 characters)
3. Verify full secret is never logged

Success criteria: Content scanning detects secrets/PII, warnings are non-blocking, redaction works.
```

**Expected Behavior**:
- ✅ Content scanner detects 10 types of secrets/PII
- ✅ Warnings are logged but don't prevent storage
- ✅ Warnings show redacted samples (first 3 + last 3 chars)
- ✅ PATTERN_CONTENT_SCANNING=false disables scanning
- ✅ Scanning works for all remember tools (remember, remember-task, remember-learning, core-memory)

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 20+ content scanning tests pass
- [ ] All 10 pattern types detected (API keys, passwords, PII, etc.)
- [ ] Warnings are non-blocking (memories stored)
- [ ] Redaction works correctly
- [ ] Opt-out mechanism works
- [ ] All remember tools integrate scanning

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Log capture/monitoring capability

**Cleanup Steps**:
1. Delete all test memories
2. Re-enable content scanning if disabled

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with secret patterns
- `fixtures/secret-patterns.json` - Sample secrets for testing (fake/test data only)

**Effort**: S (3 hours)

**Dependencies**: Scenario 01 complete

---

### Scenario 20: Metadata Preservation

**Directory**: `test-scenarios/20-metadata-preservation/`

**Description**: Validate that metadata (tags, priority, timestamps, source) is preserved across operations.

**Agent Prompt**:
```
Create a test scenario that validates metadata preservation in Pattern MCP server.

Test metadata storage:
1. Create memory with tags (array of strings, max 10, max 50 chars each)
2. Create memory with priority (1=high, 2=medium, 3=low)
3. Create memory with source (string)
4. Create memory with all metadata fields combined
5. Verify metadata is stored exactly as provided

Test metadata retrieval:
1. Recall memory with recall-context
2. Verify tags array is preserved (order, values)
3. Verify priority is preserved
4. Verify source is preserved
5. Verify timestamps (createdAt, updatedAt) are present

Test metadata across operations:
1. Create memory with metadata
2. Export with export-memories
3. Import with import-memories
4. Verify metadata preserved in round-trip
5. Share memory with share-learning
6. Verify metadata preserved after sharing
7. Commit insight (recent -> longterm)
8. Verify metadata preserved after commit

Test metadata validation:
1. Attempt to create memory with > 10 tags (should error or truncate)
2. Attempt to create memory with > 50 char tag (should error or truncate)
3. Attempt to create memory with invalid priority (should error or default)

Success criteria: All metadata preserved exactly, validation enforced.
```

**Expected Behavior**:
- ✅ Tags array preserved (max 10 tags, max 50 chars each)
- ✅ Priority preserved (1, 2, or 3)
- ✅ Source preserved
- ✅ Timestamps (createdAt, updatedAt) are set correctly
- ✅ Metadata preserved across export/import
- ✅ Metadata preserved across share-learning
- ✅ Metadata preserved across commit-insight
- ✅ Validation enforced (max tags, tag length, priority range)

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 20+ metadata tests pass
- [ ] All metadata fields preserved exactly
- [ ] Round-trip preservation validated (export/import)
- [ ] Lifecycle preservation validated (share, commit)
- [ ] Validation limits enforced

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Delete all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with metadata validation
- `fixtures/metadata-memories.json` - Memories with diverse metadata

**Effort**: S (3 hours)

**Dependencies**: Scenario 01 complete

---

### Scenario 21: Scope/Category Validation

**Directory**: `test-scenarios/21-scope-category-validation/`

**Description**: Validate that invalid scope/category combinations are rejected.

**Agent Prompt**:
```
Create a test scenario that validates scope/category combination validation in Pattern MCP server.

Valid combinations per Pattern documentation:
- Private scope: recent, tasks, longterm
- Personal scope: core
- Team scope: decisions, architecture, learnings
- Public scope: decisions, architecture, learnings

Test invalid combinations (should error):
1. Private + core (should fail - core requires personal scope)
2. Private + decisions (should fail - decisions requires team/public)
3. Private + architecture (should fail - architecture requires team/public)
4. Private + learnings (should fail - learnings requires team/public)
5. Personal + recent (should fail - recent requires private scope)
6. Personal + tasks (should fail - tasks requires private scope)
7. Personal + longterm (should fail - longterm requires private scope)
8. Personal + decisions (should fail - decisions requires team/public)
9. Team + recent (should fail - recent requires private scope)
10. Team + tasks (should fail - tasks requires private scope)
11. Team + longterm (should fail - longterm requires private scope)
12. Team + core (should fail - core requires personal scope)

Test valid combinations (should succeed):
1. Private + recent
2. Private + tasks
3. Private + longterm
4. Personal + core
5. Team + decisions
6. Team + architecture
7. Team + learnings
8. Public + decisions
9. Public + architecture
10. Public + learnings

Test default scopes:
1. Category=recent without scope (should default to private)
2. Category=core without scope (should default to personal)
3. Category=decisions without scope (should default to team)

Success criteria: All invalid combinations rejected, all valid combinations accepted, defaults work.
```

**Expected Behavior**:
- ✅ Invalid scope/category combinations are rejected with clear error
- ✅ Valid scope/category combinations are accepted
- ✅ Error messages explain the valid combinations
- ✅ Default scopes are applied correctly when not specified

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 25+ validation tests pass
- [ ] All invalid combinations rejected
- [ ] All valid combinations accepted
- [ ] Error messages are clear and helpful
- [ ] Default scopes work correctly

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Delete all test memories created with valid combinations

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with validation matrix
- `expected/validation-errors.json` - Expected error messages

**Effort**: S (2-3 hours)

**Dependencies**: Scenario 01 complete

---

### Scenario 22: Storage Limits

**Directory**: `test-scenarios/22-storage-limits/`

**Description**: Validate storage limits per scope and category.

**Agent Prompt**:
```
Create a test scenario that validates storage limits in Pattern MCP server.

Per Pattern README, limits are:
- Max memory size: 32KB
- Max memories per agent: 10,000
- Max shared memories per project: 10,000
- Max core memories per agent: 100
- Recent category limit: 1,000
- Tasks category limit: 500

Test memory size limit:
1. Create memory with 32KB content (should succeed)
2. Create memory with 33KB content (should fail - exceeds limit)
3. Verify error message mentions size limit

Test core memory limit:
1. Create 100 core memories (should succeed)
2. Attempt to create 101st core memory (should fail)
3. Verify error message mentions core memory limit

Test category limits (if enforced):
1. Create 1,000 recent category memories (should succeed)
2. Attempt to create 1,001st recent memory (may fail or trigger cleanup)
3. Create 500 tasks category memories (should succeed)
4. Attempt to create 501st tasks memory (may fail or trigger cleanup)

Test cleanup enforcement:
1. Fill recent category to limit
2. Call cleanup tool
3. Verify oldest memories are removed to enforce limit

Note: Testing 10,000 memory limits may be impractical in test scenario.
Document the limit but don't necessarily test it in full.

Success criteria: Size limits enforced, core memory limit enforced, category limits documented.
```

**Expected Behavior**:
- ✅ Max 32KB content size enforced
- ✅ Max 100 core memories per agent enforced
- ✅ Recent category limit 1,000 (enforced via cleanup)
- ✅ Tasks category limit 500 (enforced via cleanup)
- ✅ cleanup tool removes oldest when limit exceeded
- ✅ Clear error messages for limit violations

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ limit tests pass
- [ ] Size limit enforced (32KB)
- [ ] Core memory limit enforced (100)
- [ ] Category limits documented and tested (if practical)
- [ ] cleanup enforcement validated

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Sufficient resources to create 100+ memories

**Cleanup Steps**:
1. Call cleanup to remove all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with limit validation
- `fixtures/large-content.txt` - 32KB+ content for size testing

**Effort**: S (3 hours)

**Dependencies**: Scenario 01 complete

---

### Scenario 23: Large Memory Sets

**Directory**: `test-scenarios/23-large-memory-sets/`

**Description**: Validate performance with 1000+ memories per scope.

**Agent Prompt**:
```
Create a test scenario that validates Pattern MCP server performance with large memory sets.

Test with 1000+ memories:
1. Create 1,000 private scope memories using remember-bulk
2. Create 1,000 team scope memories using remember-bulk
3. Measure time to create (should be reasonable)
4. Call recall-context to retrieve all memories
5. Measure time to recall (should be reasonable)
6. Test filtering with large dataset (tags, priority, dates, search)
7. Measure time for filtered queries
8. Export all 2,000+ memories with export-memories
9. Measure export time
10. Import all 2,000+ memories with import-memories
11. Measure import time
12. Delete all 2,000+ memories with forget-bulk
13. Measure deletion time

Performance expectations:
- Bulk create: < 10 seconds for 1,000 memories
- Recall all: < 5 seconds for 2,000 memories
- Filtered recall: < 5 seconds
- Export: < 10 seconds for 2,000 memories
- Import: < 20 seconds for 2,000 memories
- Bulk delete: < 10 seconds for 2,000 memories

Success criteria: Large datasets handled efficiently, no errors, reasonable performance.
```

**Expected Behavior**:
- ✅ 1,000+ memories can be created via bulk operations
- ✅ recall-context handles 1,000+ memories efficiently
- ✅ Filtering works correctly with large datasets
- ✅ Export/import handle 1,000+ memories
- ✅ Bulk delete handles 1,000+ memories
- ✅ No memory leaks or crashes

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 1,000+ memories created successfully
- [ ] All operations complete within reasonable time
- [ ] Performance benchmarks documented
- [ ] No memory leaks detected
- [ ] System remains stable throughout

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Sufficient system resources (memory, disk)

**Cleanup Steps**:
1. Call forget-bulk to remove all test memories
2. Verify memory usage returns to baseline

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with performance measurement
- `fixtures/generate-large-dataset.mjs` - Script to generate 1,000+ test memories
- `results/performance-benchmarks.md` - Performance results

**Effort**: M (4-5 hours)

**Dependencies**: Scenario 01, 03 complete

---

### Scenario 24: Bulk Operation Performance

**Directory**: `test-scenarios/24-bulk-operation-performance/`

**Description**: Validate performance of bulk operations with 100+ items.

**Agent Prompt**:
```
Create a test scenario that validates bulk operation performance in Pattern MCP server.

Test remember-bulk performance:
1. Create 100 memories in single remember-bulk call
2. Measure time (should be faster than 100 individual remember calls)
3. Compare bulk vs individual performance (bulk should be 5-10x faster)
4. Test with validate=true (pre-flight validation)
5. Test with validate=false (validate during storage)
6. Compare performance of both approaches

Test forget-bulk performance:
1. Delete 100 memories in single forget-bulk call
2. Measure time (should be faster than 100 individual forget calls)
3. Compare bulk vs individual performance
4. Test stopOnError=true vs false (performance impact)

Test error handling performance:
1. remember-bulk with 50% invalid data (50 valid, 50 invalid)
2. Measure time with stopOnError=false
3. Measure time with stopOnError=true
4. Compare performance

Test concurrent bulk operations:
1. Launch 3 remember-bulk calls in parallel
2. Verify all succeed
3. Verify no race conditions or data corruption

Performance expectations:
- remember-bulk: < 1 second for 100 memories
- forget-bulk: < 1 second for 100 memories
- Bulk should be at least 5x faster than individual calls

Success criteria: Bulk operations are significantly faster, handle errors gracefully, no race conditions.
```

**Expected Behavior**:
- ✅ Bulk operations significantly faster than individual calls
- ✅ remember-bulk completes < 1 second for 100 memories
- ✅ forget-bulk completes < 1 second for 100 memories
- ✅ Error handling doesn't significantly impact performance
- ✅ Concurrent bulk operations work correctly
- ✅ No data corruption from race conditions

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] Performance benchmarks documented
- [ ] Bulk vs individual comparison shows >5x speedup
- [ ] Error handling performance acceptable
- [ ] Concurrent operations validated
- [ ] No race conditions detected

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Performance measurement tools

**Cleanup Steps**:
1. Delete all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with performance measurement
- `results/performance-comparison.md` - Bulk vs individual results

**Effort**: M (4 hours)

**Dependencies**: Scenario 07 complete

---

### Scenario 25: Concurrent Operations

**Directory**: `test-scenarios/25-concurrent-operations/`

**Description**: Validate concurrent remember/forget/recall operations for race conditions.

**Agent Prompt**:
```
Create a test scenario that validates concurrent operations in Pattern MCP server.

Test concurrent remember:
1. Launch 10 concurrent remember calls for same agent
2. Verify all succeed
3. Verify all memories are stored (no lost writes)
4. Verify no memory ID collisions

Test concurrent forget:
1. Create 10 memories
2. Launch 10 concurrent forget calls (one per memory)
3. Verify all succeed
4. Verify all memories are deleted

Test concurrent recall:
1. Launch 10 concurrent recall-context calls
2. Verify all succeed
3. Verify all return consistent results
4. Verify no data corruption

Test read-write concurrency:
1. Launch 5 concurrent remember calls
2. Launch 5 concurrent recall-context calls simultaneously
3. Verify no race conditions
4. Verify reads see consistent state

Test write-write concurrency:
1. Launch 5 concurrent remember calls
2. Launch 5 concurrent forget calls simultaneously
3. Verify no deadlocks
4. Verify final state is consistent

Test same-memory concurrency:
1. Create memory A
2. Launch 3 concurrent updates to memory A (using different tools)
3. Verify only one succeeds or all succeed with last-write-wins
4. Verify no data corruption

Success criteria: All concurrent operations succeed, no race conditions, no data corruption, no deadlocks.
```

**Expected Behavior**:
- ✅ Concurrent remember calls all succeed
- ✅ Concurrent forget calls all succeed
- ✅ Concurrent recall calls return consistent results
- ✅ Read-write concurrency works correctly
- ✅ Write-write concurrency handled (no deadlocks)
- ✅ No data corruption from race conditions
- ✅ NATS KV provides consistency guarantees

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 20+ concurrent operation tests pass
- [ ] No race conditions detected
- [ ] No data corruption detected
- [ ] No deadlocks occur
- [ ] Final state is consistent

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0
- Ability to launch concurrent operations

**Cleanup Steps**:
1. Delete all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with concurrent operations
- `utils/concurrency-helpers.mjs` - Helper functions for concurrent testing

**Effort**: S (3 hours)

**Dependencies**: Scenario 01, 02, 03 complete

---

### Scenario 26: NATS TCP Transport

**Directory**: `test-scenarios/26-nats-tcp-transport/`

**Description**: Validate Pattern works with TCP transport (nats://, tls://).

**Agent Prompt**:
```
Create a test scenario that validates Pattern MCP server with NATS TCP transport.

Test nats:// protocol:
1. Set NATS_URL=nats://localhost:4222
2. Connect Pattern MCP server
3. Perform basic operations (remember, recall, forget)
4. Verify all operations succeed

Test tls:// protocol (if NATS configured for TLS):
1. Set NATS_URL=tls://localhost:4222
2. Connect Pattern MCP server
3. Perform basic operations
4. Verify all operations succeed
5. Verify connection is encrypted

Test connection with custom port:
1. Set NATS_URL=nats://localhost:4223
2. Verify connection fails (port not listening) or succeeds (if NATS on that port)

Test connection error handling:
1. Set NATS_URL=nats://nonexistent-host:4222
2. Verify Pattern handles connection failure gracefully
3. Verify error message is clear

Success criteria: TCP transport works, TLS works (if available), error handling is graceful.
```

**Expected Behavior**:
- ✅ nats:// protocol works correctly
- ✅ tls:// protocol works correctly (if TLS configured)
- ✅ All MCP operations work over TCP
- ✅ Connection errors handled gracefully
- ✅ Error messages are clear

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] TCP transport validated
- [ ] TLS transport validated (if available)
- [ ] Connection error handling validated
- [ ] All MCP operations work correctly

**Setup Requirements**:
- NATS server running with JetStream enabled (TCP)
- Optional: NATS server with TLS configured
- Pattern MCP server
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Delete all test memories
2. Reset NATS_URL to default

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with transport testing
- `setup-tls-nats.sh` - Optional script to set up TLS NATS

**Effort**: S (2-3 hours)

**Dependencies**: None

---

### Scenario 27: NATS WebSocket Transport

**Directory**: `test-scenarios/27-nats-websocket-transport/`

**Description**: Validate Pattern works with WebSocket transport (ws://, wss://).

**Agent Prompt**:
```
Create a test scenario that validates Pattern MCP server with NATS WebSocket transport.

Test ws:// protocol:
1. Set NATS_URL=ws://localhost:8080 (requires NATS with WebSocket enabled)
2. Connect Pattern MCP server
3. Perform basic operations (remember, recall, forget)
4. Verify all operations succeed

Test wss:// protocol (if NATS configured for WSS):
1. Set NATS_URL=wss://localhost:8443
2. Connect Pattern MCP server
3. Perform basic operations
4. Verify all operations succeed
5. Verify connection is encrypted

Test WebSocket-specific features:
1. Verify connection upgrade from HTTP to WebSocket
2. Verify proper handling of WebSocket frames
3. Test large messages over WebSocket (near 32KB limit)

Test connection error handling:
1. Set NATS_URL=ws://nonexistent-host:8080
2. Verify Pattern handles connection failure gracefully
3. Verify error message is clear

Success criteria: WebSocket transport works, WSS works (if available), error handling is graceful.
```

**Expected Behavior**:
- ✅ ws:// protocol works correctly
- ✅ wss:// protocol works correctly (if WSS configured)
- ✅ All MCP operations work over WebSocket
- ✅ Large messages handled correctly
- ✅ Connection errors handled gracefully

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] WebSocket transport validated
- [ ] WSS transport validated (if available)
- [ ] Large messages validated
- [ ] Connection error handling validated

**Setup Requirements**:
- NATS server with WebSocket support enabled
- Optional: NATS server with WSS configured
- Pattern MCP server
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Delete all test memories
2. Reset NATS_URL to default

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with WebSocket testing
- `setup-websocket-nats.sh` - Script to set up WebSocket NATS

**Effort**: S (2-3 hours)

**Dependencies**: None

---

### Scenario 28: NATS Authentication

**Directory**: `test-scenarios/28-nats-authentication/`

**Description**: Validate NATS authentication via URL credentials and environment variables.

**Agent Prompt**:
```
Create a test scenario that validates NATS authentication in Pattern MCP server.

Test URL credentials:
1. Set NATS_URL=nats://user:pass@localhost:4222
2. Connect Pattern MCP server
3. Verify authentication succeeds
4. Perform basic operations
5. Test with invalid credentials (should fail)

Test environment variables:
1. Set NATS_URL=nats://localhost:4222
2. Set NATS_USER=user
3. Set NATS_PASS=pass
4. Connect Pattern MCP server
5. Verify authentication succeeds
6. Perform basic operations

Test credential priority:
1. Set both URL credentials and environment variables (different values)
2. Verify URL credentials take priority
3. Document priority order

Test missing credentials:
1. Connect to NATS requiring auth without credentials
2. Verify connection fails with clear error message

Test WebSocket with credentials:
1. Set NATS_URL=wss://user:pass@localhost:8443
2. Verify authentication works over WebSocket

Success criteria: Both auth methods work, priority is documented, errors are clear.
```

**Expected Behavior**:
- ✅ URL credentials work (nats://user:pass@host:port)
- ✅ Environment variables work (NATS_USER, NATS_PASS)
- ✅ URL credentials take priority over env vars
- ✅ Authentication failures have clear error messages
- ✅ WebSocket authentication works (wss://user:pass@host:port)

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] Both auth methods validated
- [ ] Priority order documented
- [ ] Invalid credentials rejected
- [ ] Error messages are clear
- [ ] WebSocket auth works

**Setup Requirements**:
- NATS server with authentication enabled
- Pattern MCP server
- Node.js >= 18.0.0
- Test credentials configured in NATS

**Cleanup Steps**:
1. Delete all test memories
2. Reset NATS credentials to default

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with auth testing
- `setup-auth-nats.conf` - NATS config with auth enabled

**Effort**: S (2-3 hours)

**Dependencies**: None

---

### Scenario 29: Bucket Management

**Directory**: `test-scenarios/29-bucket-management/`

**Description**: Validate multi-bucket routing (project bucket, user bucket, global bucket).

**Agent Prompt**:
```
Create a test scenario that validates NATS KV bucket management in Pattern MCP server.

Per Pattern architecture:
- Private scope → Project bucket (loom-pattern-{projectId})
- Team scope → Project bucket (loom-pattern-{projectId})
- Personal scope → User bucket (loom-pattern-user-{username})
- Public scope → Global bucket (loom-pattern-global)

Test bucket routing:
1. Create private memory → verify stored in project bucket
2. Create team memory → verify stored in project bucket
3. Create personal memory → verify stored in user bucket
4. Create public memory → verify stored in global bucket

Test bucket isolation:
1. Create memories in Project X (project bucket X)
2. Create memories in Project Y (project bucket Y)
3. Verify Project X memories not visible in Project Y bucket
4. Verify Project Y memories not visible in Project X bucket

Test bucket creation:
1. Start with fresh NATS (no buckets)
2. Create first memory in new project
3. Verify Pattern creates project bucket automatically
4. Verify bucket configuration (TTL, replicas, etc.)

Test bucket persistence:
1. Create memories in all scopes
2. Restart Pattern MCP server
3. Verify memories are still accessible (buckets persisted)

Use NATS CLI to inspect buckets:
```bash
nats kv ls  # List all KV buckets
nats kv get loom-pattern-{projectId} {key}  # Get specific key
```

Success criteria: Bucket routing works correctly, isolation enforced, buckets created automatically.
```

**Expected Behavior**:
- ✅ Private/team scope → project bucket
- ✅ Personal scope → user bucket
- ✅ Public scope → global bucket
- ✅ Buckets created automatically on first use
- ✅ Bucket isolation between projects
- ✅ Buckets persist across restarts

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] Bucket routing validated for all scopes
- [ ] Bucket isolation validated
- [ ] Automatic bucket creation validated
- [ ] Bucket persistence validated
- [ ] Bucket configuration correct

**Setup Requirements**:
- NATS server running with JetStream enabled
- NATS CLI installed for bucket inspection
- Pattern MCP server
- Node.js >= 18.0.0
- Ability to inspect NATS KV buckets

**Cleanup Steps**:
1. Delete all test memories
2. Optional: Delete test buckets with NATS CLI

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with bucket validation
- `utils/nats-bucket-inspector.sh` - Script to inspect buckets with NATS CLI

**Effort**: S (3 hours)

**Dependencies**: None

---

### Scenario 30: Invalid Inputs

**Directory**: `test-scenarios/30-invalid-inputs/`

**Description**: Validate error handling for invalid tool parameters.

**Agent Prompt**:
```
Create a test scenario that validates error handling for invalid inputs across all MCP tools.

Test remember tool:
1. Missing required content parameter (should error)
2. Content exceeds 32KB (should error)
3. Invalid scope value (e.g., "invalid") (should error)
4. Invalid category value (should error)
5. Invalid scope/category combination (should error)
6. Metadata with > 10 tags (should error or truncate)
7. Metadata with tag > 50 chars (should error or truncate)
8. Invalid priority (e.g., 0, 4, -1) (should error or default)

Test forget tool:
1. Missing memoryId parameter (should error)
2. Invalid memoryId format (not UUID) (should error)
3. Non-existent memoryId (should error with "not found")
4. Attempting to forget core memory without force (should error)

Test recall-context tool:
1. Invalid scope value in scopes array (should error)
2. Invalid category value in categories array (should error)
3. limit > 200 (should clamp to 200 or error)
4. limit < 1 (should error or default)
5. Invalid since timestamp (not ISO 8601) (should error)
6. Invalid date range (createdAfter > createdBefore) (should error or return empty)

Test export-memories tool:
1. Invalid outputPath (directory doesn't exist) (should error)
2. outputPath is directory not file (should error)
3. Invalid scope filter (should error)
4. Invalid category filter (should error)

Test import-memories tool:
1. Missing inputPath parameter (should error)
2. inputPath doesn't exist (should error)
3. inputPath is directory not file (should error)
4. File is not valid JSON (should error)
5. JSON missing required fields (should error)
6. JSON has unsupported version (should error)

Test bulk operations:
1. remember-bulk with empty array (should error or succeed with 0 stored)
2. remember-bulk with invalid memory structure (should error)
3. forget-bulk with empty array (should error or succeed with 0 deleted)
4. forget-bulk with invalid memory ID format (should error)

Success criteria: All invalid inputs rejected with clear error messages, no crashes.
```

**Expected Behavior**:
- ✅ All required parameters validated
- ✅ Invalid parameter values rejected
- ✅ Error messages are clear and actionable
- ✅ No crashes or undefined behavior
- ✅ Validation happens before any state changes

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 50+ invalid input tests pass
- [ ] All invalid inputs rejected
- [ ] Error messages are clear
- [ ] No crashes or undefined behavior
- [ ] Validation comprehensive across all tools

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. No cleanup needed (invalid operations don't create state)

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with invalid input validation
- `fixtures/invalid-inputs.json` - Catalog of invalid inputs to test

**Effort**: S (3 hours)

**Dependencies**: All tool scenarios (01-07) complete

---

### Scenario 31: Missing Memories

**Directory**: `test-scenarios/31-missing-memories/`

**Description**: Validate error handling for operations on non-existent memory IDs.

**Agent Prompt**:
```
Create a test scenario that validates error handling when operating on non-existent memories.

Test forget tool:
1. Generate valid UUID that doesn't exist in storage
2. Call forget with non-existent ID
3. Verify error message indicates "memory not found"
4. Verify error is clear and actionable

Test commit-insight tool:
1. Call commit-insight with non-existent memory ID
2. Verify error message indicates "memory not found"
3. Verify no state changes occur

Test share-learning tool:
1. Call share-learning with non-existent memory ID
2. Verify error message indicates "memory not found"
3. Verify no state changes occur

Test forget-bulk tool:
1. Provide mix of existing and non-existent IDs
2. With stopOnError=false: verify existing IDs deleted, non-existent reported in errors
3. With stopOnError=true: verify stops at first non-existent ID
4. Verify error messages include the non-existent IDs

Test export then delete then import:
1. Create memory, export it, delete it
2. Attempt to operate on original memory ID (should fail - not found)
3. Import the backup
4. Verify memory is accessible again with same ID

Test race condition (memory deleted between operations):
1. Create memory
2. Delete memory in parallel thread
3. Attempt to operate on memory in main thread
4. Verify "not found" error is handled gracefully

Success criteria: All operations on non-existent IDs fail gracefully with clear errors.
```

**Expected Behavior**:
- ✅ Operations on non-existent IDs fail with "not found" error
- ✅ Error messages include the memory ID
- ✅ No state changes occur on error
- ✅ Bulk operations handle mix of existing/non-existent IDs correctly
- ✅ Race conditions handled gracefully

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ missing memory tests pass
- [ ] All operations fail gracefully
- [ ] Error messages are clear
- [ ] No state changes on error
- [ ] Race conditions handled

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Delete any test memories created

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with missing memory validation

**Effort**: S (2-3 hours)

**Dependencies**: Scenarios 02, 05, 06 complete

---

### Scenario 32: Connection Failures

**Directory**: `test-scenarios/32-connection-failures/`

**Description**: Validate Pattern behavior during NATS connection loss and recovery.

**Agent Prompt**:
```
Create a test scenario that validates Pattern MCP server's handling of NATS connection failures.

Test initial connection failure:
1. Start Pattern with NATS_URL pointing to non-existent NATS server
2. Verify Pattern handles connection failure gracefully
3. Verify error message is clear
4. Verify Pattern can retry connection (if supported)

Test connection loss during operation:
1. Start Pattern with working NATS connection
2. Create some memories successfully
3. Stop NATS server (docker stop nats)
4. Attempt to create memory (should fail with connection error)
5. Restart NATS server (docker start nats)
6. Attempt to create memory (should succeed - connection recovered)

Test connection recovery:
1. Start with no NATS connection
2. Start NATS server
3. Verify Pattern reconnects automatically (if supported)
4. Verify operations work after reconnection

Test partial operation failure:
1. Start bulk operation (remember-bulk with 100 memories)
2. Kill NATS connection mid-operation
3. Verify partial results are reported
4. Verify no data corruption
5. Restart NATS and verify state is consistent

Test resilience:
1. Intermittent connection (rapid start/stop NATS)
2. Verify Pattern handles intermittent connectivity
3. Verify no crashes or undefined behavior

Success criteria: Connection failures handled gracefully, recovery works, no data corruption.
```

**Expected Behavior**:
- ✅ Initial connection failure has clear error message
- ✅ Connection loss during operation fails gracefully
- ✅ Connection recovery works (auto-reconnect if supported)
- ✅ Partial operation failures reported correctly
- ✅ No data corruption from connection loss
- ✅ Intermittent connectivity handled

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 10+ connection failure tests pass
- [ ] Initial connection failure handled
- [ ] Connection loss during operation handled
- [ ] Connection recovery validated
- [ ] No data corruption
- [ ] Error messages are clear

**Setup Requirements**:
- NATS server running with JetStream enabled (with ability to stop/start)
- Pattern MCP server running
- Node.js >= 18.0.0
- Docker or ability to control NATS server lifecycle

**Cleanup Steps**:
1. Ensure NATS server is running
2. Delete all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with connection failure simulation
- `utils/nats-lifecycle.sh` - Script to start/stop NATS server

**Effort**: S (3 hours)

**Dependencies**: None

---

### Scenario 33: Access Control

**Directory**: `test-scenarios/33-access-control/`

**Description**: Validate access control for team/public memories created by other agents.

**Agent Prompt**:
```
Create a test scenario that validates access control in Pattern MCP server.

Test team scope access control:
1. Agent A creates team scope memory
2. Agent B reads team memory via recall-context (should succeed - team is shared)
3. Agent B attempts to forget Agent A's team memory (should fail - access denied)
4. Agent B creates own team memory
5. Agent B forgets own team memory (should succeed)
6. Verify error message for access denied is clear

Test public scope access control:
1. Agent A creates public scope memory
2. Agent B reads public memory via recall-context (should succeed - public is shared)
3. Agent B attempts to forget Agent A's public memory (should fail - access denied)
4. Agent B creates own public memory
5. Agent B forgets own public memory (should succeed)

Test private scope access control:
1. Agent A creates private scope memory
2. Agent B cannot see Agent A's private memory (complete isolation)
3. Agent B cannot forget Agent A's private memory (not visible)

Test share-learning access control:
1. Agent A creates private memory
2. Agent B attempts to share Agent A's memory (should fail - not visible/accessible)
3. Agent A shares own private memory to team
4. Agent B can now see shared memory (team scope)
5. Agent B still cannot delete shared memory (created by Agent A)

Test bulk operations access control:
1. Agent A creates 10 team memories
2. Agent B attempts forget-bulk on Agent A's memories (should fail for all)
3. Agent B creates 10 team memories
4. Agent B forget-bulk on own memories (should succeed for all)

Success criteria: Access control enforced, only creator can delete team/public memories.
```

**Expected Behavior**:
- ✅ Team/public memories are readable by all agents
- ✅ Team/public memories can only be deleted by creator
- ✅ Private memories are completely isolated (not visible to others)
- ✅ share-learning requires ownership
- ✅ Access control enforced in bulk operations
- ✅ Clear error messages for access denied

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 20+ access control tests pass
- [ ] All scopes enforce correct access control
- [ ] Bulk operations respect access control
- [ ] Error messages are clear
- [ ] No unauthorized access possible

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running (multiple agent identities)
- Node.js >= 18.0.0
- Ability to simulate multiple agents

**Cleanup Steps**:
1. Delete all test memories from both agents

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with multi-agent access control
- `setup-agents.sh` - Script to launch multiple agent identities

**Effort**: S (3 hours)

**Dependencies**: Scenarios 14, 15 complete

---

### Scenario 34: Batch Partial Failures

**Directory**: `test-scenarios/34-batch-partial-failures/`

**Description**: Validate bulk operations with mixed valid/invalid data (partial success scenarios).

**Agent Prompt**:
```
Create a test scenario that validates partial failure handling in bulk operations.

Test remember-bulk with mixed data:
1. Prepare array with 50 valid + 50 invalid memories
2. Call remember-bulk with stopOnError=false
3. Verify stored count = 50
4. Verify failed count = 50
5. Verify errors array has 50 entries with correct indices
6. Verify memoryIds array has 50 UUIDs
7. Verify invalid memories are not stored

Test remember-bulk with stopOnError=true:
1. Prepare array with 10 valid + 10 invalid memories (invalid at index 5)
2. Call remember-bulk with stopOnError=true
3. Verify stored count = 5 (stopped at first error)
4. Verify failed count = 1 (only first error reported)
5. Verify errors array has 1 entry (index 5)
6. Verify remaining 14 memories (indices 6-19) not processed

Test forget-bulk with mixed data:
1. Create 50 memories
2. Prepare array with 50 existing IDs + 50 non-existent IDs
3. Call forget-bulk with stopOnError=false
4. Verify deleted count = 50
5. Verify failed count = 50
6. Verify errors array has 50 entries with correct IDs
7. Verify existing memories are deleted

Test forget-bulk with stopOnError=true:
1. Prepare array with 10 existing + 10 non-existent IDs (non-existent at index 5)
2. Call forget-bulk with stopOnError=true
3. Verify deleted count = 5
4. Verify failed count = 1
5. Verify remaining memories (indices 6-19) not processed

Test validation failure scenarios:
1. remember-bulk with validate=true and some invalid data
2. Verify NOTHING is stored (all-or-nothing validation)
3. Verify all errors reported in single error response
4. Test with validate=false - verify valid memories stored, invalid skipped

Test real-world scenarios:
1. Importing backup with some corrupted entries
2. Batch creating memories with some duplicates
3. Batch deleting with some already-deleted IDs

Success criteria: Partial failures handled gracefully, counts accurate, errors detailed.
```

**Expected Behavior**:
- ✅ stopOnError=false: continues processing, reports all errors
- ✅ stopOnError=true: stops at first error, reports partial results
- ✅ Counts are accurate (stored/deleted/failed)
- ✅ Error messages include indices/IDs
- ✅ Valid operations succeed even when some fail
- ✅ validate=true prevents any storage on validation failure

**Success Criteria**:
- [ ] Test script executes without errors
- [ ] 15+ partial failure tests pass
- [ ] stopOnError flag behavior validated
- [ ] Counts are accurate in all scenarios
- [ ] Error reporting is detailed
- [ ] Real-world scenarios validated

**Setup Requirements**:
- NATS server running with JetStream enabled
- Pattern MCP server running
- Node.js >= 18.0.0

**Cleanup Steps**:
1. Delete all test memories

**Files to Create**:
- `README.md` - This specification
- `test-script.mjs` - Executable test with partial failure scenarios
- `fixtures/mixed-valid-invalid.json` - Mixed data for testing

**Effort**: S (3 hours)

**Dependencies**: Scenario 07 complete

---

## Execution Strategy

### Phase Sequencing

1. **Phase 1 (Batch 1)**: Basic tool functionality - 7 agents in parallel
2. **Phase 2 (Batch 2)**: Advanced features - 5 agents in parallel (after Phase 1)
3. **Phase 3 (Batch 3)**: Multi-agent scenarios - 4 agents (partial parallelization, after Phase 1, 2)
4. **Phase 4 (Batch 4)**: Data integrity - 5 agents in parallel (after Phase 1)
5. **Phase 5 (Batch 5)**: Performance - 3 agents in parallel (after Phase 1)
6. **Phase 6 (Batch 6)**: Integration - 4 agents in parallel (independent)
7. **Phase 7 (Batch 7)**: Error handling - 5 agents in parallel (after Phase 1)

### Total Effort Estimate

| Phase | Scenarios | Effort | Agents | Wall Time (Parallel) |
|-------|-----------|--------|--------|---------------------|
| 1 | 7 | 7S (14-21h) | 7 | 2-3h |
| 2 | 6 | 5S+2M (18-20h) | 5-6 | 3-4h |
| 3 | 4 | 2S+2M (12-14h) | 2-4 | 5-7h |
| 4 | 5 | 4S+1M (12-15h) | 5 | 2-3h |
| 5 | 3 | 1S+2M (10-12h) | 3 | 3-4h |
| 6 | 4 | 4S (8-12h) | 4 | 2-3h |
| 7 | 5 | 5S (10-15h) | 5 | 2-3h |
| **Total** | **34** | **84-109h** | **7-33** | **19-27h** |

**With maximum parallelization**: 19-27 hours wall time
**Sequential execution**: 84-109 hours

### Critical Path

The longest dependency chain is:
1. Phase 1 (2-3h) →
2. Phase 2 (3-4h) →
3. Phase 3 (5-7h)

**Critical path total**: 10-14 hours

### Recommended Execution Order

1. **Week 1**: Phase 1 + Phase 6 (basic tools + infrastructure) - parallel
2. **Week 2**: Phase 2 + Phase 4 (advanced features + data integrity) - parallel after Phase 1
3. **Week 3**: Phase 3 + Phase 5 + Phase 7 (multi-agent + performance + errors) - parallel after Week 2

## Implementation Notes

### Test Script Template

Each scenario should include a test script following this pattern:

```javascript
#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Test configuration
const config = {
  command: 'npx',
  args: ['@loominal/pattern'],
  env: {
    NATS_URL: process.env.NATS_URL || 'nats://localhost:4222',
    LOOMINAL_PROJECT_ID: 'test-scenario-XX'
  }
};

// Test execution
async function runTests() {
  const transport = new StdioClientTransport(config);
  const client = new Client({ name: 'test-client', version: '1.0.0' }, {
    capabilities: {}
  });

  await client.connect(transport);

  try {
    // Test case 1
    console.log('Test case 1: ...');
    const result1 = await client.callTool('remember', {
      content: 'Test memory',
      scope: 'private',
      category: 'longterm'
    });
    console.log('✅ Test case 1 passed');

    // Test case 2
    // ...

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

runTests();
```

### Success Tracking

Create a test results spreadsheet:

| Scenario | Status | Pass/Fail/Total | Duration | Notes |
|----------|--------|-----------------|----------|-------|
| 01-remember-basic | ✅ Complete | 22/22 | 2.5h | All scopes/categories validated |
| 02-forget-basic | ⏳ In Progress | 8/12 | - | - |
| ... | | | | |

### Acceptance Criteria

A scenario is considered **complete** when:
- [ ] README.md written with full specification
- [ ] Test script implemented and executable
- [ ] All test cases pass
- [ ] Fixtures and expected outputs created
- [ ] Cleanup verified (no memory leaks)
- [ ] Results documented
- [ ] Pull request reviewed and merged

## Deliverables

1. **test-scenarios/** directory with 34 scenario subdirectories
2. **Test scripts** for each scenario (executable .mjs files)
3. **Fixtures** for each scenario (JSON test data)
4. **Results documentation** (performance benchmarks, test results)
5. **Summary report** (test coverage matrix, pass/fail rates)

## Next Steps

1. **Review this roadmap** with stakeholders
2. **Assign scenarios** to agents (or self-assign)
3. **Set up test infrastructure** (NATS server, Pattern server, test framework)
4. **Begin Phase 1** (7 scenarios in parallel)
5. **Track progress** using success tracking spreadsheet
6. **Document learnings** and update roadmap as needed

---

## Appendix: Tool Coverage Matrix

| Tool | Scenarios Testing This Tool |
|------|----------------------------|
| remember | 01, 08-12, 14-17, 19-22, 25, 30 |
| forget | 02, 14, 15, 17, 25, 30, 31, 33 |
| recall-context | 03, 08-12, 14-17, 23, 25, 30 |
| remember-task | 04, 18, 19, 30 |
| remember-learning | 04, 18, 19, 30 |
| commit-insight | 05, 20, 30, 31 |
| core-memory | 05, 16, 19, 22, 30 |
| share-learning | 05, 20, 30, 31, 33 |
| cleanup | 18, 22, 30 |
| export-memories | 06, 13, 23, 30 |
| import-memories | 06, 13, 23, 30, 31 |
| remember-bulk | 07, 13, 23, 24, 25, 30, 34 |
| forget-bulk | 07, 23, 24, 25, 30, 34 |

## Appendix: Feature Coverage

| Feature | Scenarios Testing This Feature |
|---------|-------------------------------|
| 4-scope model | 01, 14, 15, 16 |
| 7 categories | 01, 21 |
| TTL expiration | 04, 18 |
| Content scanning | 19 |
| Metadata | 20 |
| Multi-bucket storage | 29 |
| Tag filtering | 08, 12 |
| Priority filtering | 09, 12 |
| Date filtering | 10, 12 |
| Content search | 11, 12 |
| Sub-agent access | 17 |
| Access control | 14, 15, 33 |
| Storage limits | 22 |
| Large datasets | 23 |
| Bulk operations | 07, 24, 34 |
| Concurrent operations | 25 |
| TCP transport | 26 |
| WebSocket transport | 27 |
| Authentication | 28 |
| Connection failures | 32 |
| Error handling | 30, 31, 34 |

---

**End of Roadmap**
