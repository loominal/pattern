/**
 * Storage backend interface for Pattern
 * Allows pluggable storage implementations (NATS KV, file, memory, etc.)
 */

import type { Memory } from '../types.js';

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
}

/**
 * Build a storage key from components
 * Format: {scope}/{category}/{memoryId} or agents/{agentId}/{category}/{memoryId}
 *
 * @param agentId - Agent identifier (for private memories)
 * @param category - Memory category
 * @param memoryId - Memory UUID
 * @param scope - Memory scope (private or shared)
 * @returns Storage key string
 */
export function buildKey(
  agentId: string,
  category: string,
  memoryId: string,
  scope: 'private' | 'shared'
): string {
  if (scope === 'shared') {
    return `shared/${category}/${memoryId}`;
  } else {
    return `agents/${agentId}/${category}/${memoryId}`;
  }
}

/**
 * Parse a storage key back to components
 *
 * @param key - Storage key string
 * @returns Object with agentId, category, memoryId, and scope
 */
export function parseKey(key: string): {
  agentId?: string;
  category: string;
  memoryId: string;
  scope: 'private' | 'shared';
} {
  const parts = key.split('/');

  if (parts[0] === 'shared') {
    // Format: shared/{category}/{memoryId}
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
      scope: 'shared',
    };
  } else if (parts[0] === 'agents') {
    // Format: agents/{agentId}/{category}/{memoryId}
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
      scope: 'private',
    };
  } else {
    throw new Error(`Invalid key format: ${key}`);
  }
}
