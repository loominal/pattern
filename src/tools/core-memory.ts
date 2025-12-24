/**
 * MCP tool: core-memory
 * Store identity-defining memory in the 'core' category (no TTL, protected)
 * Uses 'personal' scope so core memories follow the user across projects
 */

import { v4 as uuidv4 } from 'uuid';
import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { Memory, MemoryMetadata, PatternConfig } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import { buildKey } from '../storage/interface.js';
import { getDefaultScanner } from '../security/content-scanner.js';
import { logger } from '../logger.js';

export interface CoreMemoryInput {
  content: string; // Max 32KB
  metadata?: MemoryMetadata;
}

export interface CoreMemoryOutput {
  memoryId: string;
}

const MAX_CONTENT_SIZE = 32 * 1024; // 32KB in bytes
const MAX_CORE_MEMORIES = 100;

/**
 * Core memory tool handler
 * Stores identity-defining memory in 'core' category with protection
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @param config - Optional Pattern configuration
 * @returns Memory ID
 */
export async function coreMemory(
  input: CoreMemoryInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string,
  config?: PatternConfig
): Promise<CoreMemoryOutput> {
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

  // Check core memory limit
  // Core memories use 'personal' scope, so they're stored in user bucket
  const corePrefix = `pattern.agents/${agentId}/core/`;
  const existingCoreMemories = await storage.keysFromUserBucket(corePrefix, agentId);

  if (existingCoreMemories.length >= MAX_CORE_MEMORIES) {
    throw new PatternError(
      PatternErrorCode.STORAGE_FULL,
      `Maximum number of core memories (${MAX_CORE_MEMORIES}) reached for agent ${agentId}`,
      {
        currentCount: existingCoreMemories.length,
        maxCount: MAX_CORE_MEMORIES,
        agentId,
      }
    );
  }

  // Scan content for sensitive information (non-blocking)
  const scanningEnabled = config?.contentScanning?.enabled ?? true;
  if (scanningEnabled) {
    const scanner = getDefaultScanner();
    const scanResult = scanner.scan(input.content);

    if (scanResult.hasWarnings) {
      const warningCount = scanResult.warnings.length;
      logger.warn(
        `Content scanning detected ${warningCount} potential sensitive information warning(s):`
      );
      const formatted = scanner.formatWarnings(scanResult.warnings);
      logger.warn(formatted);
      logger.warn(
        'This is a non-blocking warning. The core memory has been stored. Review the content to ensure no secrets or PII were accidentally included.'
      );
    }
  }

  // Generate memory ID
  const memoryId = uuidv4();

  // Create memory object
  // Use 'personal' scope so core memories follow the user across projects
  const now = new Date().toISOString();
  const memory: Memory = {
    id: memoryId,
    agentId,
    projectId,
    scope: 'personal',
    category: 'core',
    content: input.content,
    ...(input.metadata && { metadata: input.metadata }),
    createdAt: now,
    updatedAt: now,
    // Core memories never expire - omit expiresAt property
    version: 1,
  };

  // Build storage key
  const key = buildKey(agentId, 'core', memoryId, 'personal');

  // Store in NATS KV (no TTL)
  await storage.set(key, memory);

  // Return result
  return {
    memoryId,
  };
}
