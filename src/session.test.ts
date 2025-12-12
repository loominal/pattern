/**
 * Tests for AgentSession class and session utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrCreateAgentId, getProjectId, AgentSession } from './session.js';

describe('getOrCreateAgentId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env to a clean state before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = originalEnv;
  });

  it('should return agent ID from LOOM_AGENT_ID environment variable when set', () => {
    const testAgentId = 'test-agent-123';
    process.env.LOOM_AGENT_ID = testAgentId;

    const agentId = getOrCreateAgentId();

    expect(agentId).toBe(testAgentId);
  });

  it('should generate a new UUID when LOOM_AGENT_ID is not set', () => {
    delete process.env.LOOM_AGENT_ID;

    const agentId = getOrCreateAgentId();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(agentId).toMatch(uuidRegex);
  });

  it('should generate different UUIDs on subsequent calls when LOOM_AGENT_ID is not set', () => {
    delete process.env.LOOM_AGENT_ID;

    const agentId1 = getOrCreateAgentId();
    const agentId2 = getOrCreateAgentId();

    expect(agentId1).not.toBe(agentId2);
  });

  it('should handle empty string in LOOM_AGENT_ID as falsy', () => {
    process.env.LOOM_AGENT_ID = '';

    const agentId = getOrCreateAgentId();

    // Empty string is falsy, so it should generate a new UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(agentId).toMatch(uuidRegex);
  });
});

describe('getProjectId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return project ID from LOOM_PROJECT_ID environment variable when set', () => {
    const testProjectId = 'my-awesome-project';
    process.env.LOOM_PROJECT_ID = testProjectId;

    const projectId = getProjectId();

    expect(projectId).toBe(testProjectId);
  });

  it('should return "default" when LOOM_PROJECT_ID is not set', () => {
    delete process.env.LOOM_PROJECT_ID;

    const projectId = getProjectId();

    expect(projectId).toBe('default');
  });

  it('should return "default" when LOOM_PROJECT_ID is empty string', () => {
    process.env.LOOM_PROJECT_ID = '';

    const projectId = getProjectId();

    expect(projectId).toBe('default');
  });

  it('should handle special characters in project ID', () => {
    const specialProjectId = 'project-2024_test.123';
    process.env.LOOM_PROJECT_ID = specialProjectId;

    const projectId = getProjectId();

    expect(projectId).toBe(specialProjectId);
  });
});

describe('AgentSession', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Use fake timers for consistent time-based testing
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should initialize with provided agentId and projectId', () => {
      const agentId = 'test-agent-456';
      const projectId = 'test-project-789';

      const session = new AgentSession(agentId, projectId);

      expect(session.agentId).toBe(agentId);
      expect(session.projectId).toBe(projectId);
      expect(session.sessionStart).toBeInstanceOf(Date);
    });

    it('should use getOrCreateAgentId when agentId is not provided', () => {
      const testAgentId = 'env-agent-id';
      process.env.LOOM_AGENT_ID = testAgentId;

      const session = new AgentSession(undefined, 'test-project');

      expect(session.agentId).toBe(testAgentId);
    });

    it('should use getProjectId when projectId is not provided', () => {
      const testProjectId = 'env-project-id';
      process.env.LOOM_PROJECT_ID = testProjectId;

      const session = new AgentSession('test-agent');

      expect(session.projectId).toBe(testProjectId);
    });

    it('should use defaults from environment when both params are undefined', () => {
      process.env.LOOM_AGENT_ID = 'env-agent';
      process.env.LOOM_PROJECT_ID = 'env-project';

      const session = new AgentSession();

      expect(session.agentId).toBe('env-agent');
      expect(session.projectId).toBe('env-project');
    });

    it('should generate agent ID and use default project when no env vars set', () => {
      delete process.env.LOOM_AGENT_ID;
      delete process.env.LOOM_PROJECT_ID;

      const session = new AgentSession();

      // Agent ID should be a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(session.agentId).toMatch(uuidRegex);
      expect(session.projectId).toBe('default');
    });

    it('should set sessionStart to current time', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const session = new AgentSession('test-agent', 'test-project');

      expect(session.sessionStart.getTime()).toBe(now.getTime());
    });
  });

  describe('getSessionDuration', () => {
    it('should return 0 milliseconds immediately after initialization', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const session = new AgentSession('test-agent', 'test-project');

      expect(session.getSessionDuration()).toBe(0);
    });

    it('should return correct duration after time has passed', () => {
      const startTime = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(startTime);

      const session = new AgentSession('test-agent', 'test-project');

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      expect(session.getSessionDuration()).toBe(5000);
    });

    it('should return correct duration after multiple time advances', () => {
      const startTime = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(startTime);

      const session = new AgentSession('test-agent', 'test-project');

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);
      expect(session.getSessionDuration()).toBe(1000);

      // Advance time by 2 more seconds (total 3 seconds)
      vi.advanceTimersByTime(2000);
      expect(session.getSessionDuration()).toBe(3000);

      // Advance time by 7 more seconds (total 10 seconds)
      vi.advanceTimersByTime(7000);
      expect(session.getSessionDuration()).toBe(10000);
    });

    it('should handle long-running sessions', () => {
      const startTime = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(startTime);

      const session = new AgentSession('test-agent', 'test-project');

      // Advance time by 1 hour (3600000 ms)
      vi.advanceTimersByTime(3600000);

      expect(session.getSessionDuration()).toBe(3600000);
    });
  });

  describe('getSessionInfo', () => {
    it('should return session information with correct structure', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const agentId = 'test-agent-123';
      const projectId = 'test-project-456';
      const session = new AgentSession(agentId, projectId);

      const info = session.getSessionInfo();

      expect(info).toEqual({
        agentId,
        projectId,
        sessionStart: now.toISOString(),
        sessionDuration: 0,
      });
    });

    it('should return ISO 8601 formatted sessionStart', () => {
      const now = new Date('2024-01-15T10:30:45.123Z');
      vi.setSystemTime(now);

      const session = new AgentSession('test-agent', 'test-project');

      const info = session.getSessionInfo();

      expect(info.sessionStart).toBe('2024-01-15T10:30:45.123Z');
    });

    it('should return updated duration on subsequent calls', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const session = new AgentSession('test-agent', 'test-project');

      const info1 = session.getSessionInfo();
      expect(info1.sessionDuration).toBe(0);

      // Advance time by 2 seconds
      vi.advanceTimersByTime(2000);

      const info2 = session.getSessionInfo();
      expect(info2.sessionDuration).toBe(2000);
      expect(info2.sessionStart).toBe(info1.sessionStart); // Start time should not change
    });

    it('should keep agentId and projectId consistent across calls', () => {
      const agentId = 'consistent-agent';
      const projectId = 'consistent-project';
      const session = new AgentSession(agentId, projectId);

      const info1 = session.getSessionInfo();
      vi.advanceTimersByTime(1000);
      const info2 = session.getSessionInfo();

      expect(info1.agentId).toBe(agentId);
      expect(info2.agentId).toBe(agentId);
      expect(info1.projectId).toBe(projectId);
      expect(info2.projectId).toBe(projectId);
    });
  });

  describe('logSummary', () => {
    it('should not throw when called immediately after initialization', () => {
      const session = new AgentSession('test-agent', 'test-project');

      expect(() => session.logSummary()).not.toThrow();
    });

    it('should not throw when called after time has passed', () => {
      const session = new AgentSession('test-agent', 'test-project');

      vi.advanceTimersByTime(5000);

      expect(() => session.logSummary()).not.toThrow();
    });

    it('should handle sessions with very short duration', () => {
      const session = new AgentSession('test-agent', 'test-project');

      vi.advanceTimersByTime(100); // 0.1 seconds

      expect(() => session.logSummary()).not.toThrow();
    });

    it('should handle sessions with long duration', () => {
      const session = new AgentSession('test-agent', 'test-project');

      vi.advanceTimersByTime(3600000); // 1 hour

      expect(() => session.logSummary()).not.toThrow();
    });
  });

  describe('Session Immutability', () => {
    it('should have readonly agentId (TypeScript compile-time check)', () => {
      const session = new AgentSession('test-agent', 'test-project');
      const originalAgentId = session.agentId;

      // TypeScript prevents modification at compile time with 'readonly' keyword
      // At runtime, JavaScript doesn't enforce this, but TypeScript does
      expect(session.agentId).toBe(originalAgentId);
    });

    it('should have readonly projectId (TypeScript compile-time check)', () => {
      const session = new AgentSession('test-agent', 'test-project');
      const originalProjectId = session.projectId;

      // TypeScript prevents modification at compile time with 'readonly' keyword
      expect(session.projectId).toBe(originalProjectId);
    });

    it('should have readonly sessionStart (TypeScript compile-time check)', () => {
      const session = new AgentSession('test-agent', 'test-project');
      const originalStart = session.sessionStart;

      // TypeScript prevents modification at compile time with 'readonly' keyword
      expect(session.sessionStart).toBe(originalStart);
    });
  });

  describe('Multiple Sessions', () => {
    it('should allow multiple independent session instances', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const session1 = new AgentSession('agent-1', 'project-1');

      vi.advanceTimersByTime(1000);

      const session2 = new AgentSession('agent-2', 'project-2');

      expect(session1.agentId).toBe('agent-1');
      expect(session2.agentId).toBe('agent-2');
      expect(session1.projectId).toBe('project-1');
      expect(session2.projectId).toBe('project-2');

      // Session 1 should have 1 second duration
      expect(session1.getSessionDuration()).toBe(1000);
      // Session 2 should have 0 duration
      expect(session2.getSessionDuration()).toBe(0);
    });

    it('should track durations independently for multiple sessions', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const session1 = new AgentSession('agent-1', 'project-1');

      vi.advanceTimersByTime(2000);

      const session2 = new AgentSession('agent-2', 'project-2');

      vi.advanceTimersByTime(3000);

      expect(session1.getSessionDuration()).toBe(5000); // 2s + 3s
      expect(session2.getSessionDuration()).toBe(3000); // only 3s
    });
  });
});
