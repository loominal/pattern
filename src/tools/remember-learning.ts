/**
 * MCP tool: remember-learning
 * Shorthand for storing a learning memory (always 'private' scope, 'recent' category, 24h TTL)
 */

import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { MemoryMetadata, PatternConfig } from '../types.js';
import { remember, type RememberOutput } from './remember.js';

export interface RememberLearningInput {
  content: string; // Max 32KB
  metadata?: MemoryMetadata;
}

/**
 * Remember learning tool handler
 * Equivalent to remember(content, scope='private', category='recent')
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @param config - Optional Pattern configuration
 * @returns Memory ID and expiration time (always has 24h TTL)
 */
export async function rememberLearning(
  input: RememberLearningInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string,
  config?: PatternConfig
): Promise<RememberOutput> {
  return remember(
    {
      content: input.content,
      scope: 'private',
      category: 'recent',
      ...(input.metadata && { metadata: input.metadata }),
    },
    storage,
    projectId,
    agentId,
    config
  );
}
