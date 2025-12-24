/**
 * Tests for import-memories tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importMemories, type ImportMemoriesInput } from './import-memories.js';
import type { ExportFormat } from './export-memories.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { promises as fs } from 'fs';

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

describe('import-memories tool', () => {
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
    it('should import valid memories from file', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
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
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(storage.set).toHaveBeenCalledTimes(2);
    });

    it('should overwrite existing memories when overwriteExisting is true', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-1',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Updated content',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-02T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue({
        id: 'mem-1',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Old content',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      });
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
        overwriteExisting: true,
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should skip existing memories when overwriteExisting is false', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-exists',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Exists',
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
            content: 'New',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockImplementation(async (key: string) => {
        if (key.includes('mem-exists')) {
          return {
            id: 'mem-exists',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Exists',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          };
        }
        return null;
      });
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
        overwriteExisting: false,
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1); // Only mem-new
      expect(result.skipped).toBe(1); // mem-exists
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('already exists');

      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should skip invalid memories when skipInvalid is true', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-valid',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Valid memory',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
          {
            // Invalid: missing required field
            id: 'mem-invalid',
            agentId,
            projectId,
            scope: 'private',
            // category missing
            content: 'Invalid memory',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          } as unknown as Memory,
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
        skipInvalid: true,
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid memory structure');

      expect(storage.set).toHaveBeenCalledTimes(1);
    });

    it('should import memories with TTL categories', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-recent',
            agentId,
            projectId,
            scope: 'private',
            category: 'recent',
            content: 'Recent memory',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            expiresAt: '2025-01-02T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);

      const [, , ttl] = vi.mocked(storage.set).mock.calls[0];
      expect(ttl).toBe(86400); // 24 hours in seconds
    });

    it('should import memories with metadata', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
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
              source: 'backup',
            },
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);

      const [, memory] = vi.mocked(storage.set).mock.calls[0];
      expect(memory.metadata).toEqual({
        tags: ['important', 'test'],
        priority: 1,
        source: 'backup',
      });
    });
  });

  describe('Different Scopes', () => {
    it('should import private scope memories', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-1',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Private',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);
      expect(storage.ensureBucketForScope).toHaveBeenCalledWith('private', projectId, agentId);
    });

    it('should import personal scope memories', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-1',
            agentId,
            projectId,
            scope: 'personal',
            category: 'core',
            content: 'Personal',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromUserBucket).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);
      expect(storage.ensureBucketForScope).toHaveBeenCalledWith('personal', projectId, agentId);
    });

    it('should import team scope memories', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-1',
            agentId,
            projectId,
            scope: 'team',
            category: 'decisions',
            content: 'Team',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);
      expect(storage.ensureBucketForScope).toHaveBeenCalledWith('team', projectId, agentId);
    });

    it('should import public scope memories', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-1',
            agentId,
            projectId,
            scope: 'public',
            category: 'learnings',
            content: 'Public',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromGlobalBucket).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1);
      expect(storage.ensureBucketForScope).toHaveBeenCalledWith('public', projectId, agentId);
    });
  });

  describe('Validation Errors', () => {
    it('should reject invalid JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(
        'Invalid JSON format'
      );
    });

    it('should reject missing export format fields', async () => {
      const invalidData = {
        version: '1.0',
        // Missing exportedAt, projectId, agentId, memories
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidData));

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(
        'Invalid export format'
      );
    });

    it('should reject invalid scope/category combinations', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-1',
            agentId,
            projectId,
            scope: 'team',
            category: 'recent', // Invalid: team scope with recent category
            content: 'Invalid',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
        skipInvalid: true,
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not valid for team scope');
    });

    it('should fail if skipInvalid is false and memory is invalid', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            // Missing required fields
            id: 'mem-1',
          } as unknown as Memory,
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
        skipInvalid: false,
      };

      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
    });

    it('should fail if skipInvalid is false and memory exists', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
          {
            id: 'mem-exists',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Exists',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue({
        id: 'mem-exists',
        agentId,
        projectId,
        scope: 'private',
        category: 'longterm',
        content: 'Exists',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        version: 1,
      });

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
        overwriteExisting: false,
        skipInvalid: false,
      };

      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(PatternError);
      await expect(importMemories(input, storage, projectId, agentId)).rejects.toThrow(
        'Failed to read import file'
      );
    });

    it('should handle storage errors during import', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
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
          {
            id: 'mem-2',
            agentId,
            projectId,
            scope: 'private',
            category: 'longterm',
            content: 'Test 2',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockImplementation(async (key: string) => {
        if (key.includes('mem-1')) {
          throw new Error('Storage error');
        }
      });

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
        skipInvalid: true,
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(1); // Only mem-2
      expect(result.skipped).toBe(1); // mem-1 failed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Storage error');
    });

    it('should handle relative input path', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));

      const input: ImportMemoriesInput = {
        inputPath: 'backup.json', // Relative path
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(0);

      // Should have resolved to absolute path
      const readPath = vi.mocked(fs.readFile).mock.calls[0][0];
      expect(readPath).toContain('backup.json');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty memories array', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(storage.set).not.toHaveBeenCalled();
    });

    it('should warn about version mismatch but continue', async () => {
      const exportData: ExportFormat = {
        version: '2.0', // Future version
        exportedAt: '2025-01-01T10:00:00Z',
        projectId,
        agentId,
        memories: [
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
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      // Should still import despite version mismatch
      expect(result.imported).toBe(1);
    });

    it('should handle memories from different projects and agents', async () => {
      const exportData: ExportFormat = {
        version: '1.0',
        exportedAt: '2025-01-01T10:00:00Z',
        projectId: 'other-project',
        agentId: 'other-agent',
        memories: [
          {
            id: 'mem-1',
            agentId: 'other-agent',
            projectId: 'other-project',
            scope: 'private',
            category: 'longterm',
            content: 'From other project',
            createdAt: '2025-01-01T10:00:00Z',
            updatedAt: '2025-01-01T10:00:00Z',
            version: 1,
          },
        ],
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(exportData));
      vi.mocked(storage.getFromProject).mockResolvedValue(null);
      vi.mocked(storage.ensureBucketForScope).mockResolvedValue(undefined);
      vi.mocked(storage.set).mockResolvedValue(undefined);

      const input: ImportMemoriesInput = {
        inputPath: '/tmp/backup.json',
      };

      const result = await importMemories(input, storage, projectId, agentId);

      // Should import with original projectId and agentId preserved
      expect(result.imported).toBe(1);

      const [, memory] = vi.mocked(storage.set).mock.calls[0];
      expect(memory.projectId).toBe('other-project');
      expect(memory.agentId).toBe('other-agent');
    });
  });
});
