/**
 * MCP tool: remember-task
 * Shorthand for storing a task memory (always 'private' scope, 'tasks' category, 24h TTL)
 */

import type { NatsKvBackend } from '../storage/nats-kv.js';
import type { MemoryMetadata } from '../types.js';
import { remember, type RememberOutput } from './remember.js';

export interface RememberTaskInput {
  content: string; // Max 32KB
  metadata?: MemoryMetadata;
}

/**
 * Remember task tool handler
 * Equivalent to remember(content, scope='private', category='tasks')
 * @param input - Tool input parameters
 * @param storage - NATS KV storage backend
 * @param projectId - Current project ID
 * @param agentId - Current agent ID
 * @returns Memory ID and expiration time (always has 24h TTL)
 */
export async function rememberTask(
  input: RememberTaskInput,
  storage: NatsKvBackend,
  projectId: string,
  agentId: string
): Promise<RememberOutput> {
  return remember(
    {
      content: input.content,
      scope: 'private',
      category: 'tasks',
      ...(input.metadata && { metadata: input.metadata }),
    },
    storage,
    projectId,
    agentId
  );
}
