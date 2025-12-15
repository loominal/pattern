/**
 * MCP tool: remember
 * Store a new memory with content, scope, category, and metadata
 */

import { v4 as uuidv4 } from 'uuid';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory, MemoryCategory, MemoryMetadata } from '../types.js';
import { PatternError, PatternErrorCode, validateScopeCategory, getTTL } from '../types.js';
import { buildKey } from '../storage/interface.js';

export interface RememberInput {
  content: string; // Max 32KB
  scope?: 'private' | 'shared'; // default: 'private'
  category?: MemoryCategory; // default: 'recent'
  metadata?: MemoryMetadata;
}

export interface RememberOutput {
  memoryId: string;
  expiresAt?: string; // ISO 8601, only for TTL memories
}

const MAX_CONTENT_SIZE = 32 * 1024; // 32KB in bytes

/**
 * Remember tool handler
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Memory ID and expiration time (if applicable)
 */
export async function remember(
  input: RememberInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<RememberOutput> {
  // Validate input
  if (!input.content || input.content.trim() === '') {
    throw new PatternError(PatternErrorCode.VALIDATION_ERROR, 'Content cannot be empty');
  }

  // Check content size
  const contentSize = Buffer.byteLength(input.content, 'utf8');
  if (contentSize > MAX_CONTENT_SIZE) {
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      `Content size (${contentSize} bytes) exceeds maximum (${MAX_CONTENT_SIZE} bytes)`,
      { contentSize, maxSize: MAX_CONTENT_SIZE }
    );
  }

  // Set defaults
  const scope = input.scope ?? 'private';
  const category = input.category ?? 'recent';

  // Validate scope/category combination
  validateScopeCategory(scope, category);

  // Generate memory ID
  const memoryId = uuidv4();

  // Calculate expiration time if TTL applies
  const ttl = getTTL(category);
  let expiresAt: string | undefined;
  if (ttl !== undefined) {
    const expirationDate = new Date(Date.now() + ttl * 1000);
    expiresAt = expirationDate.toISOString();
  }

  // Create memory object
  const now = new Date().toISOString();
  const memory: Memory = {
    id: memoryId,
    agentId,
    projectId,
    scope,
    category,
    content: input.content,
    ...(input.metadata && { metadata: input.metadata }),
    createdAt: now,
    updatedAt: now,
    ...(expiresAt && { expiresAt }),
    version: 1,
  };

  // Build storage key
  const key = buildKey(agentId, category, memoryId, scope);

  // Store in NATS KV
  await storage.set(key, memory, ttl);

  // Return result
  return {
    memoryId,
    ...(expiresAt && { expiresAt }),
  };
}
