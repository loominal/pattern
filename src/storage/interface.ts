/**
 * Storage backend interface for Pattern
 * Allows pluggable storage implementations (NATS KV, file, memory, etc.)
 */

import type { Memory } from '../types.js';
import type { LoominalScope } from '@loominal/shared/types';

export interface StorageBackend {
  /**
   * Initialize the storage backend
   */
  connect(): Promise<void>;

  /**
   * Close the storage backend
   */
  disconnect(): Promise<void>;

  /**
   * Get a memory by key
   * @param key - Storage key (format depends on backend)
   * @returns Memory object or null if not found
   */
  get(key: string): Promise<Memory | null>;

  /**
   * Set a memory with optional TTL
   * @param key - Storage key
   * @param memory - Memory object to store
   * @param ttl - Optional TTL in seconds
   */
  set(key: string, memory: Memory, ttl?: number): Promise<void>;

  /**
   * Delete a memory
   * @param key - Storage key
   * @returns true if deleted, false if not found
   */
  delete(key: string): Promise<boolean>;

  /**
   * List all memories matching a prefix
   * @param prefix - Key prefix to filter by
   * @returns Array of Memory objects
   */
  list(prefix: string): Promise<Memory[]>;

  /**
   * List all keys matching a prefix
   * @param prefix - Key prefix to filter by
   * @returns Array of key strings
   */
  keys(prefix: string): Promise<string[]>;

  /**
   * Ensure storage bucket/namespace exists for a project
   * @param projectId - Project identifier
   */
  ensureBucket(projectId: string): Promise<void>;

  /**
   * Check if backend is connected
   */
  isConnected(): boolean;

  /**
   * Get a memory by key from a specific project
   * @param key - Storage key
   * @param projectId - Project identifier
   * @returns Memory object or null if not found
   */
  getFromProject(key: string, projectId: string): Promise<Memory | null>;

  /**
   * Delete a memory by key from a specific project
   * @param key - Storage key
   * @param projectId - Project identifier
   * @returns true if deleted, false if not found
   */
  deleteFromProject(key: string, projectId: string): Promise<boolean>;

  /**
   * List all memories matching a prefix from a specific project
   * @param prefix - Key prefix to filter by
   * @param projectId - Project identifier
   * @returns Array of Memory objects
   */
  listFromProject(prefix: string, projectId: string): Promise<Memory[]>;

  /**
   * List all keys matching a prefix from a specific project
   * @param prefix - Key prefix to filter by
   * @param projectId - Project identifier
   * @returns Array of key strings
   */
  keysFromProject(prefix: string, projectId: string): Promise<string[]>;

  // ============================================================================
  // User Bucket Methods (for personal scope)
  // ============================================================================

  /**
   * Get a memory from user bucket (for personal scope)
   * @param key - Storage key
   * @param agentId - Agent identifier (determines which user bucket)
   * @returns Memory object or null if not found
   */
  getFromUserBucket(key: string, agentId: string): Promise<Memory | null>;

  /**
   * List all memories matching a prefix from user bucket
   * @param prefix - Key prefix to filter by
   * @param agentId - Agent identifier
   * @returns Array of Memory objects
   */
  listFromUserBucket(prefix: string, agentId: string): Promise<Memory[]>;

  /**
   * List all keys matching a prefix from user bucket
   * @param prefix - Key prefix to filter by
   * @param agentId - Agent identifier
   * @returns Array of key strings
   */
  keysFromUserBucket(prefix: string, agentId: string): Promise<string[]>;

  /**
   * Delete a memory from user bucket
   * @param key - Storage key
   * @param agentId - Agent identifier
   * @returns true if deleted, false if not found
   */
  deleteFromUserBucket(key: string, agentId: string): Promise<boolean>;

  // ============================================================================
  // Global Bucket Methods (for public scope)
  // ============================================================================

  /**
   * Get a memory from global bucket (for public scope)
   * @param key - Storage key
   * @returns Memory object or null if not found
   */
  getFromGlobalBucket(key: string): Promise<Memory | null>;

  /**
   * List all memories matching a prefix from global bucket
   * @param prefix - Key prefix to filter by
   * @returns Array of Memory objects
   */
  listFromGlobalBucket(prefix: string): Promise<Memory[]>;

  /**
   * List all keys matching a prefix from global bucket
   * @param prefix - Key prefix to filter by
   * @returns Array of key strings
   */
  keysFromGlobalBucket(prefix: string): Promise<string[]>;

  /**
   * Delete a memory from global bucket
   * @param key - Storage key
   * @returns true if deleted, false if not found
   */
  deleteFromGlobalBucket(key: string): Promise<boolean>;
}

/**
 * Build a storage key from components
 * Format varies by scope:
 * - private/personal: agents/{agentId}/{category}/{memoryId}
 * - team/public: shared/{category}/{memoryId}
 *
 * @param agentId - Agent identifier (for private/personal memories)
 * @param category - Memory category
 * @param memoryId - Memory UUID
 * @param scope - Memory scope
 * @returns Storage key string
 */
export function buildKey(
  agentId: string,
  category: string,
  memoryId: string,
  scope: LoominalScope
): string {
  if (scope === 'team' || scope === 'public') {
    return `shared/${category}/${memoryId}`;
  } else {
    // private or personal
    return `agents/${agentId}/${category}/${memoryId}`;
  }
}

/**
 * Parse a storage key back to components
 * Note: Cannot distinguish between team/public or private/personal from key alone.
 * Bucket context is needed to determine the exact scope.
 *
 * @param key - Storage key string
 * @returns Object with agentId, category, memoryId, and isShared flag
 */
export function parseKey(key: string): {
  agentId?: string;
  category: string;
  memoryId: string;
  isShared: boolean; // true for team/public, false for private/personal
} {
  const parts = key.split('/');

  if (parts[0] === 'shared') {
    // Format: shared/{category}/{memoryId}
    // Could be team or public scope (determined by bucket)
    if (parts.length !== 3) {
      throw new Error(`Invalid shared key format: ${key}`);
    }
    const category = parts[1];
    const memoryId = parts[2];
    if (!category || !memoryId) {
      throw new Error(`Invalid shared key format: ${key}`);
    }
    return {
      category,
      memoryId,
      isShared: true,
    };
  } else if (parts[0] === 'agents') {
    // Format: agents/{agentId}/{category}/{memoryId}
    // Could be private or personal scope (determined by bucket)
    if (parts.length !== 4) {
      throw new Error(`Invalid private key format: ${key}`);
    }
    const agentId = parts[1];
    const category = parts[2];
    const memoryId = parts[3];
    if (!agentId || !category || !memoryId) {
      throw new Error(`Invalid private key format: ${key}`);
    }
    return {
      agentId,
      category,
      memoryId,
      isShared: false,
    };
  } else {
    throw new Error(`Invalid key format: ${key}`);
  }
}
