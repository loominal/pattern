/**
 * Tests for export-memories tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportMemories, type ExportMemoriesInput, type ExportFormat } from './export-memories.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock logger
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
  },
}));

const createMockStorage = () => {
  const mockStorage = {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    keys: vi.fn(),
    getFromProject: vi.fn(),
    deleteFromProject: vi.fn(),
    listFromProject: vi.fn(),
    keysFromProject: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(),
    ensureBucket: vi.fn(),
    ensureUserBucket: vi.fn(),
    ensureGlobalBucket: vi.fn(),
    ensureBucketForScope: vi.fn(),
    getFromUserBucket: vi.fn().mockResolvedValue(null),
    listFromUserBucket: vi.fn().mockResolvedValue([]),
    keysFromUserBucket: vi.fn().mockResolvedValue([]),
    deleteFromUserBucket: vi.fn().mockResolvedValue(false),
    getFromGlobalBucket: vi.fn().mockResolvedValue(null),
    listFromGlobalBucket: vi.fn().mockResolvedValue([]),
    keysFromGlobalBucket: vi.fn().mockResolvedValue([]),
    deleteFromGlobalBucket: vi.fn().mockResolvedValue(false),
  } as unknown as NatsKvBackend;
  return mockStorage;
};

describe('export-memories tool', () => {
  let storage: NatsKvBackend;
  const projectId = 'test-project-123';
  const agentId = 'test-agent-456';

  beforeEach(() => {
    storage = createMockStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should export all memories with default filename', async () => {
      const privateMemories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test memory 1',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      const teamMemories: Memory[] = [
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'team',
          category: 'decisions',
          content: 'Test memory 2',
          createdAt: '2025-01-01T11:00:00Z',
          updatedAt: '2025-01-01T11:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return privateMemories;
        if (prefix === 'shared/') return teamMemories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(2);
      expect(result.filepath).toMatch(/memories-backup-.*\.json$/);
      expect(result.bytes).toBeGreaterThan(0);

      // Verify writeFile was called
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const [filepath, content] = vi.mocked(fs.writeFile).mock.calls[0];
      expect(filepath).toBe(result.filepath);

      // Parse and verify content
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.version).toBe('1.0');
      expect(exportData.projectId).toBe(projectId);
      expect(exportData.agentId).toBe(agentId);
      expect(exportData.memories).toHaveLength(2);
      expect(exportData.memories).toEqual([...privateMemories, ...teamMemories]);
    });

    it('should export to custom output path', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return memories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const customPath = '/tmp/my-backup.json';
      const input: ExportMemoriesInput = {
        outputPath: customPath,
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.filepath).toBe(customPath);
      expect(result.exported).toBe(1);
    });

    it('should filter by scope (private)', async () => {
      const privateMemories: Memory[] = [
        {
          id: 'mem-private',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Private memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) {
          return privateMemories;
        }
        return [];
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        scope: 'private',
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(1);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories).toHaveLength(1);
      expect(exportData.memories[0].scope).toBe('private');
    });

    it('should filter by scope (team)', async () => {
      const teamMemories: Memory[] = [
        {
          id: 'mem-team',
          agentId,
          projectId,
          scope: 'team',
          category: 'decisions',
          content: 'Team memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === 'shared/') {
          return teamMemories;
        }
        return [];
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        scope: 'team',
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(1);
    });

    it('should filter by category', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Longterm memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Recent memory',
          createdAt: '2025-01-01T11:00:00Z',
          updatedAt: '2025-01-01T11:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return memories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        category: 'longterm',
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(1);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories[0].category).toBe('longterm');
    });

    it('should filter by since timestamp', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-old',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Old memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-new',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'New memory',
          createdAt: '2025-01-01T11:00:00Z',
          updatedAt: '2025-01-02T15:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return memories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        since: '2025-01-02T00:00:00Z',
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(1);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories[0].id).toBe('mem-new');
    });

    it('should exclude expired memories by default', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-active',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Active memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          expiresAt: new Date(now.getTime() + 86400000).toISOString(), // Future
          version: 1,
        },
        {
          id: 'mem-expired',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Expired memory',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(), // Past
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return memories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(1);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories[0].id).toBe('mem-active');
    });

    it('should include expired memories when includeExpired is true', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-active',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Active memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-expired',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Expired memory',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2025-01-01T09:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return memories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        includeExpired: true,
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(2);
    });
  });

  describe('Combined Filters', () => {
    it('should apply scope and category filters together', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Private longterm',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-2',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Private recent',
          createdAt: '2025-01-01T11:00:00Z',
          updatedAt: '2025-01-01T11:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockResolvedValue(memories);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        scope: 'private',
        category: 'longterm',
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(1);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories[0].id).toBe('mem-1');
    });

    it('should apply all filters together', async () => {
      const now = new Date();
      const memories: Memory[] = [
        {
          id: 'mem-match',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Matches all filters',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-02T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-wrong-category',
          agentId,
          projectId,
          scope: 'private',
          category: 'recent',
          content: 'Wrong category',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-02T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-too-old',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Too old',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
        {
          id: 'mem-expired',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Expired',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-02T10:00:00Z',
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockResolvedValue(memories);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        scope: 'private',
        category: 'longterm',
        since: '2025-01-02T00:00:00Z',
        includeExpired: false,
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(1);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories[0].id).toBe('mem-match');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty memory list', async () => {
      vi.mocked(storage.listFromProject).mockResolvedValue([]);
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(0);
      expect(result.bytes).toBeGreaterThan(0); // Still has JSON structure

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories).toHaveLength(0);
    });

    it('should handle relative output path', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockResolvedValue(memories);
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {
        outputPath: 'my-backup.json',
      };

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(path.isAbsolute(result.filepath)).toBe(true);
      expect(result.filepath).toContain('my-backup.json');
    });

    it('should handle memories with metadata', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test',
          metadata: {
            tags: ['important', 'test'],
            priority: 1,
            source: 'manual',
          },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockResolvedValue(memories);
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      const result = await exportMemories(input, storage, projectId, agentId);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories[0].metadata).toEqual({
        tags: ['important', 'test'],
        priority: 1,
        source: 'manual',
      });
    });

    it('should handle memories from all scopes', async () => {
      const privateMemories: Memory[] = [
        {
          id: 'mem-private',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Private',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      const personalMemories: Memory[] = [
        {
          id: 'mem-personal',
          agentId,
          projectId,
          scope: 'personal',
          category: 'core',
          content: 'Personal',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      const teamMemories: Memory[] = [
        {
          id: 'mem-team',
          agentId,
          projectId,
          scope: 'team',
          category: 'decisions',
          content: 'Team',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      const publicMemories: Memory[] = [
        {
          id: 'mem-public',
          agentId,
          projectId,
          scope: 'public',
          category: 'learnings',
          content: 'Public',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return privateMemories;
        if (prefix === 'shared/') return teamMemories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockResolvedValue(personalMemories);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue(publicMemories);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      const result = await exportMemories(input, storage, projectId, agentId);

      expect(result.exported).toBe(4);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;
      expect(exportData.memories).toHaveLength(4);

      const scopes = exportData.memories.map((m) => m.scope);
      expect(scopes).toContain('private');
      expect(scopes).toContain('personal');
      expect(scopes).toContain('team');
      expect(scopes).toContain('public');
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid since timestamp', async () => {
      vi.mocked(storage.listFromProject).mockResolvedValue([]);
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);

      const input: ExportMemoriesInput = {
        since: 'invalid-date',
      };

      await expect(exportMemories(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
      await expect(exportMemories(input, storage, projectId, agentId)).rejects.toThrow(
        'Invalid since timestamp'
      );
    });

    it('should handle file write errors', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockResolvedValue(memories);
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

      const input: ExportMemoriesInput = {};

      await expect(exportMemories(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
      await expect(exportMemories(input, storage, projectId, agentId)).rejects.toThrow(
        'Failed to export memories'
      );
    });

    it('should handle storage errors gracefully', async () => {
      vi.mocked(storage.listFromProject).mockRejectedValue(new Error('Storage error'));
      vi.mocked(storage.listFromUserBucket).mockRejectedValue(new Error('Storage error'));
      vi.mocked(storage.listFromGlobalBucket).mockRejectedValue(new Error('Storage error'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      // Should gracefully handle errors and export 0 memories
      const result = await exportMemories(input, storage, projectId, agentId);
      expect(result.exported).toBe(0);
    });

    it('should continue if fetching one scope fails', async () => {
      const privateMemories: Memory[] = [
        {
          id: 'mem-private',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Private',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockImplementation(async (prefix: string) => {
        if (prefix === `agents/${agentId}/`) return privateMemories;
        return [];
      });
      vi.mocked(storage.listFromUserBucket).mockRejectedValue(new Error('User bucket error'));
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      const result = await exportMemories(input, storage, projectId, agentId);

      // Should still export the private memories
      expect(result.exported).toBe(1);
    });
  });

  describe('JSON Format Validation', () => {
    it('should produce valid JSON format', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test memory',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockResolvedValue(memories);
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      await exportMemories(input, storage, projectId, agentId);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const exportData = JSON.parse(content as string) as ExportFormat;

      // Verify structure
      expect(exportData).toHaveProperty('version');
      expect(exportData).toHaveProperty('exportedAt');
      expect(exportData).toHaveProperty('projectId');
      expect(exportData).toHaveProperty('agentId');
      expect(exportData).toHaveProperty('memories');

      // Verify types
      expect(typeof exportData.version).toBe('string');
      expect(typeof exportData.exportedAt).toBe('string');
      expect(typeof exportData.projectId).toBe('string');
      expect(typeof exportData.agentId).toBe('string');
      expect(Array.isArray(exportData.memories)).toBe(true);

      // Verify exportedAt is valid ISO 8601
      expect(() => new Date(exportData.exportedAt)).not.toThrow();
    });

    it('should format JSON with proper indentation', async () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          agentId,
          projectId,
          scope: 'private',
          category: 'longterm',
          content: 'Test',
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          version: 1,
        },
      ];

      vi.mocked(storage.listFromProject).mockResolvedValue(memories);
      vi.mocked(storage.listFromUserBucket).mockResolvedValue([]);
      vi.mocked(storage.listFromGlobalBucket).mockResolvedValue([]);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: ExportMemoriesInput = {};

      await exportMemories(input, storage, projectId, agentId);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];

      // Should have newlines and indentation (formatted JSON)
      expect(content).toContain('\n');
      expect(content).toContain('  '); // 2-space indentation
    });
  });
});
