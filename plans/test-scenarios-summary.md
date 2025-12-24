# Pattern v0.4.0 Test Scenario Plan - Executive Summary

## Overview

This document summarizes the comprehensive test scenario plan for Pattern v0.4.0 MCP server. The full roadmap is available in `test-scenarios-roadmap.md`.

## What Was Created

A detailed roadmap for creating **34 independent, parallelizable test scenarios** organized into 7 phases.

## Key Highlights

### Coverage

- **13 MCP tools** - All tools tested individually and in combination
- **4 scopes** - private, personal, team, public isolation validated
- **7 categories** - All category behaviors validated
- **v0.4.0 features** - Export/import, query filters, batch operations
- **v0.3.1 features** - Content scanning, security
- **Architecture** - Multi-bucket storage, NATS transport variants

### Organization

**7 Phases** with clear dependencies:

1. **Phase 1 (7 scenarios)** - Basic tool functionality - Fully parallelizable
2. **Phase 2 (6 scenarios)** - Advanced v0.4.0 features - Depends on Phase 1
3. **Phase 3 (4 scenarios)** - Multi-agent isolation - Depends on Phase 1, 2
4. **Phase 4 (5 scenarios)** - Data integrity & TTL - Depends on Phase 1
5. **Phase 5 (3 scenarios)** - Performance & scale - Depends on Phase 1
6. **Phase 6 (4 scenarios)** - Integration & transport - Independent
7. **Phase 7 (5 scenarios)** - Error handling - Depends on Phase 1

### Effort Estimates

- **Total Effort**: 84-109 hours (sequential)
- **Wall Time**: 19-27 hours (fully parallelized with 7-33 agents)
- **Critical Path**: 10-14 hours (Phase 1 → 2 → 3)

### Scenario Structure

Each scenario includes:

```
test-scenarios/XX-scenario-name/
├── README.md          # Full specification
│   ├── Description
│   ├── Agent Prompt (what to tell an agent to do)
│   ├── Expected Behavior
│   ├── Success Criteria (checkboxes)
│   ├── Setup Requirements
│   ├── Cleanup Steps
│   └── Files to Create
├── test-script.mjs    # Executable test
├── fixtures/          # Test data
└── expected/          # Expected outputs
```

## Scenario Highlights

### Basic Functionality (Phase 1)

- **01-remember-basic** - All scopes/categories, metadata
- **02-forget-basic** - Core memory protection, access control
- **03-recall-context-basic** - Retrieval, filtering by scope/category
- **04-task-learning-shortcuts** - Shorthand tools, TTL
- **05-lifecycle-tools** - commit-insight, core-memory, share-learning
- **06-export-import-basic** - Backup/restore workflows
- **07-batch-operations-basic** - Bulk remember/forget

### Advanced Features (Phase 2)

- **08-11** - Query filtering (tags, priority, dates, search)
- **12** - Combined filters with AND logic
- **13** - Advanced export/import with validation

### Multi-Agent (Phase 3)

- **14** - Private scope isolation
- **15** - Team scope visibility
- **16** - Personal scope cross-project
- **17** - Sub-agent access rules

### Data Integrity (Phase 4)

- **18** - TTL expiration (24h for recent/tasks)
- **19** - Content scanning (secrets/PII detection)
- **20** - Metadata preservation
- **21** - Scope/category validation
- **22** - Storage limits (32KB, 100 core memories, etc.)

### Performance (Phase 5)

- **23** - Large memory sets (1000+ memories)
- **24** - Bulk operation performance
- **25** - Concurrent operations

### Integration (Phase 6)

- **26** - TCP transport (nats://, tls://)
- **27** - WebSocket transport (ws://, wss://)
- **28** - Authentication (URL, env vars)
- **29** - Bucket management (multi-bucket routing)

### Error Handling (Phase 7)

- **30** - Invalid inputs across all tools
- **31** - Missing memories
- **32** - Connection failures & recovery
- **33** - Access control enforcement
- **34** - Batch partial failures

## Agent Prompts

Each scenario includes a **clear agent prompt** that can be handed to an AI agent to execute. Example:

> Create a test scenario that validates the Pattern MCP server's `remember` tool.
>
> Test the following:
> 1. Store memories with all 4 scopes (private, personal, team, public)
> 2. Store memories in all 7 categories...
> 3. Validate scope/category combinations...
>
> Create a test script (test-script.mjs) that:
> - Connects to Pattern MCP server
> - Calls remember with various combinations
> - Validates responses
> - Cleans up memories after test
>
> Success criteria: All remember calls succeed with correct scope/category...

## Success Criteria

Each scenario has **explicit checkboxes** for validation:

- [ ] Test script executes without errors
- [ ] All X test cases pass
- [ ] Feature Y validated
- [ ] Error messages are clear
- [ ] Cleanup verified

## Execution Strategy

### Recommended Timeline

**Week 1**: Phase 1 + Phase 6 (infrastructure)
- 11 scenarios in parallel
- Basic tools + transport/auth
- Wall time: ~4-6 hours

**Week 2**: Phase 2 + Phase 4 + Phase 5
- 14 scenarios in parallel
- Advanced features + integrity + performance
- Wall time: ~5-8 hours

**Week 3**: Phase 3 + Phase 7
- 9 scenarios in parallel
- Multi-agent + error handling
- Wall time: ~8-12 hours

**Total**: 3 weeks, 17-26 hours wall time (parallelized)

### Parallelization Strategy

- **Phase 1**: 7 agents in parallel (fully independent)
- **Phase 2**: 5-6 agents in parallel (after Phase 1)
- **Phase 3**: 2-4 agents (requires coordination)
- **Phase 4**: 5 agents in parallel (after Phase 1)
- **Phase 5**: 3 agents in parallel (after Phase 1)
- **Phase 6**: 4 agents in parallel (independent)
- **Phase 7**: 5 agents in parallel (after Phase 1)

**Maximum parallelization**: 33 agents simultaneously (if all prerequisites met)

## Coverage Matrix

### Tool Coverage

Every MCP tool is tested in multiple scenarios:

- remember: 14 scenarios
- forget: 10 scenarios
- recall-context: 12 scenarios
- remember-task: 4 scenarios
- remember-learning: 4 scenarios
- commit-insight: 4 scenarios
- core-memory: 5 scenarios
- share-learning: 5 scenarios
- cleanup: 3 scenarios
- export-memories: 4 scenarios
- import-memories: 5 scenarios
- remember-bulk: 7 scenarios
- forget-bulk: 6 scenarios

### Feature Coverage

- ✅ All v0.4.0 features (export/import, filters, bulk ops)
- ✅ All v0.3.1 features (content scanning)
- ✅ All v0.3.0 features (core functionality)
- ✅ Multi-agent isolation
- ✅ Sub-agent access control
- ✅ All transport variants (TCP, WebSocket, TLS)
- ✅ All authentication methods
- ✅ Performance at scale
- ✅ Error handling edge cases

## What Makes This Plan Effective

### 1. Independence

Each scenario is **self-contained**:
- Own setup/cleanup
- No shared state between scenarios
- Can run in any order (within phase dependencies)

### 2. Clear Prompts

Each scenario includes an **agent prompt** that:
- Explains what to test
- Provides specific steps
- Defines success criteria
- Can be handed directly to an AI agent

### 3. Parallelizable

Scenarios are organized into **batches** that can run in parallel:
- Phase 1: 7 scenarios → 7 agents simultaneously
- Phase 2: 6 scenarios → 6 agents simultaneously
- Etc.

### 4. Comprehensive

**34 scenarios** covering:
- All 13 MCP tools
- All 4 scopes
- All 7 categories
- All v0.4.0 features
- All v0.3.1 features
- Integration with NATS
- Performance at scale
- Error handling

### 5. Realistic

Each scenario tests **real-world use cases**:
- Backup/restore workflows
- Multi-agent collaboration
- Connection failures
- Large datasets
- Concurrent operations

### 6. Documented

Each scenario includes:
- README.md with full specification
- Test script template
- Expected behavior
- Success criteria (checkboxes)
- Setup/cleanup instructions

## Next Steps

### 1. Review & Approve

Review the roadmap (`test-scenarios-roadmap.md`) and approve the approach.

### 2. Set Up Infrastructure

- NATS server with JetStream enabled
- Pattern MCP server build
- Test framework (MCP SDK client)
- Performance measurement tools

### 3. Assign Scenarios

Option A: **Parallel execution by multiple agents**
- Assign Phase 1 scenarios (01-07) to 7 different agents
- Each agent receives their scenario's README.md as a prompt
- Agents work in parallel

Option B: **Sequential execution**
- Work through scenarios 01-34 in order
- ~80-100 hours total effort

### 4. Execute Phase 1

Start with the 7 basic functionality scenarios:
- 01-remember-basic
- 02-forget-basic
- 03-recall-context-basic
- 04-task-learning-shortcuts
- 05-lifecycle-tools
- 06-export-import-basic
- 07-batch-operations-basic

### 5. Track Progress

Use the success tracking spreadsheet template in the roadmap.

### 6. Iterate

- Document learnings
- Update roadmap as needed
- Adjust effort estimates based on actual results

## Example: How to Use a Scenario

1. **Pick a scenario** (e.g., `01-remember-basic`)
2. **Read the README.md** in the roadmap for full specification
3. **Copy the agent prompt** and give it to an AI agent (or execute yourself)
4. **Create the directory structure**:
   ```
   test-scenarios/01-remember-basic/
   ├── README.md
   ├── test-script.mjs
   └── fixtures/
   ```
5. **Implement the test script** according to the specification
6. **Run the test** and validate against success criteria
7. **Mark checkboxes** as tests pass
8. **Document results** (pass/fail, duration, notes)
9. **Submit for review**

## Questions?

Refer to:
- **Full roadmap**: `test-scenarios-roadmap.md`
- **Pattern README**: `/var/home/mike/source/loominal/pattern/README.md`
- **CHANGELOG**: `/var/home/mike/source/loominal/pattern/CHANGELOG.md`

---

**Total Scenarios**: 34
**Total Effort**: 84-109 hours sequential, 19-27 hours parallelized
**Coverage**: 13 tools, all scopes, all categories, all v0.4.0 features
**Ready for**: Parallel agent execution

**Status**: ✅ Planning Complete - Ready for Implementation
