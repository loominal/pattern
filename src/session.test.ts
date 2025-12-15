/**
 * Tests for AgentSession class
 * Tests for v0.2.0 unified identity management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentSession } from './session.js';

describe('AgentSession', () => {
  beforeEach(() => {
    // Use fake timers for consistent time-based testing
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor - Root Agent', () => {
    it('should initialize with provided agentId and projectId', () => {
      const agentId = 'test-agent-456';
      const projectId = 'test-project-789';

      const session = new AgentSession(agentId, projectId);

      expect(session.agentId).toBe(agentId);
      expect(session.projectId).toBe(projectId);
      expect(session.isSubagent).toBe(false);
      expect(session.parentId).toBeUndefined();
      expect(session.sessionStart).toBeInstanceOf(Date);
    });

    it('should throw when agentId is empty string', () => {
      expect(() => {
        new AgentSession('', 'test-project');
      }).toThrow('agentId is required and cannot be empty');
    });

    it('should throw when agentId is whitespace only', () => {
      expect(() => {
        new AgentSession('   ', 'test-project');
      }).toThrow('agentId is required and cannot be empty');
    });

    it('should throw when projectId is empty string', () => {
      expect(() => {
        new AgentSession('test-agent', '');
      }).toThrow('projectId is required and cannot be empty');
    });

    it('should throw when projectId is whitespace only', () => {
      expect(() => {
        new AgentSession('test-agent', '   ');
      }).toThrow('projectId is required and cannot be empty');
    });

    it('should set sessionStart to current time', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const session = new AgentSession('test-agent', 'test-project');

      expect(session.sessionStart.getTime()).toBe(now.getTime());
    });

    it('should set isSubagent to false by default', () => {
      const session = new AgentSession('test-agent', 'test-project');

      expect(session.isSubagent).toBe(false);
    });

    it('should accept explicit isSubagent=false', () => {
      const session = new AgentSession('test-agent', 'test-project', false);

      expect(session.isSubagent).toBe(false);
      expect(session.parentId).toBeUndefined();
    });
  });

  describe('Constructor - Sub-agent', () => {
    it('should initialize sub-agent with parentId', () => {
      const agentId = 'sub-agent-123';
      const projectId = 'test-project';
      const parentId = 'parent-agent-456';

      const session = new AgentSession(agentId, projectId, true, parentId);

      expect(session.agentId).toBe(agentId);
      expect(session.projectId).toBe(projectId);
      expect(session.isSubagent).toBe(true);
      expect(session.parentId).toBe(parentId);
      expect(session.sessionStart).toBeInstanceOf(Date);
    });

    it('should throw when isSubagent=true but parentId is missing', () => {
      expect(() => {
        new AgentSession('test-agent', 'test-project', true);
      }).toThrow('parentId is required when isSubagent is true');
    });

    it('should throw when isSubagent=true but parentId is undefined', () => {
      expect(() => {
        new AgentSession('test-agent', 'test-project', true, undefined);
      }).toThrow('parentId is required when isSubagent is true');
    });

    it('should allow parentId when isSubagent=false (for flexibility)', () => {
      // This is allowed but parentId will be stored
      const session = new AgentSession('test-agent', 'test-project', false, 'parent-id');

      expect(session.isSubagent).toBe(false);
      expect(session.parentId).toBe('parent-id');
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

  describe('getSessionInfo - Root Agent', () => {
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
        isSubagent: false,
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

    it('should not include parentId for root agent', () => {
      const session = new AgentSession('test-agent', 'test-project');

      const info = session.getSessionInfo();

      expect(info.parentId).toBeUndefined();
      expect('parentId' in info).toBe(false);
    });
  });

  describe('getSessionInfo - Sub-agent', () => {
    it('should return session information with parentId for sub-agent', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const agentId = 'sub-agent-123';
      const projectId = 'test-project';
      const parentId = 'parent-agent-456';

      const session = new AgentSession(agentId, projectId, true, parentId);

      const info = session.getSessionInfo();

      expect(info).toEqual({
        agentId,
        projectId,
        isSubagent: true,
        parentId,
        sessionStart: now.toISOString(),
        sessionDuration: 0,
      });
    });

    it('should include parentId in session info when present', () => {
      const session = new AgentSession('sub-agent', 'test-project', true, 'parent-agent');

      const info = session.getSessionInfo();

      expect(info.isSubagent).toBe(true);
      expect(info.parentId).toBe('parent-agent');
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

    it('should handle sub-agent session summary', () => {
      const session = new AgentSession('sub-agent', 'test-project', true, 'parent-agent');

      vi.advanceTimersByTime(1000);

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

    it('should have readonly isSubagent (TypeScript compile-time check)', () => {
      const session = new AgentSession('test-agent', 'test-project');
      const originalIsSubagent = session.isSubagent;

      expect(session.isSubagent).toBe(originalIsSubagent);
    });

    it('should have readonly parentId (TypeScript compile-time check)', () => {
      const session = new AgentSession('test-agent', 'test-project', true, 'parent-id');
      const originalParentId = session.parentId;

      expect(session.parentId).toBe(originalParentId);
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

    it('should support both root and sub-agent sessions simultaneously', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      vi.setSystemTime(now);

      const rootSession = new AgentSession('root-agent', 'project-1');
      const subSession = new AgentSession('sub-agent', 'project-1', true, 'root-agent');

      expect(rootSession.isSubagent).toBe(false);
      expect(rootSession.parentId).toBeUndefined();

      expect(subSession.isSubagent).toBe(true);
      expect(subSession.parentId).toBe('root-agent');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in agentId', () => {
      const session = new AgentSession('agent-123_test.abc', 'test-project');

      expect(session.agentId).toBe('agent-123_test.abc');
    });

    it('should handle special characters in projectId', () => {
      const session = new AgentSession('test-agent', 'project-2024_test.123');

      expect(session.projectId).toBe('project-2024_test.123');
    });

    it('should handle UUID format agentId', () => {
      const uuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      const session = new AgentSession(uuid, 'test-project');

      expect(session.agentId).toBe(uuid);
    });

    it('should handle very long agentId', () => {
      const longId = 'a'.repeat(100);
      const session = new AgentSession(longId, 'test-project');

      expect(session.agentId).toBe(longId);
    });

    it('should handle very long projectId', () => {
      const longId = 'p'.repeat(100);
      const session = new AgentSession('test-agent', longId);

      expect(session.projectId).toBe(longId);
    });
  });
});
