/**
 * Identity loading module for Pattern
 *
 * Pattern reads agent identity from Warp's NATS KV store. Warp writes the identity
 * on startup; Pattern reads it with retry logic to handle timing issues.
 *
 * @module identity
 */

import type { KV, NatsConnection } from 'nats';
import { createLogger } from './logger.js';

const logger = createLogger('identity');

/**
 * Root agent identity for v0.2.0 unified identity management
 */
export interface RootIdentity {
  /** Deterministic ID: sha256(hostname + projectPath).substring(0, 32) */
  agentId: string;
  /** Machine hostname from os.hostname() */
  hostname: string;
  /** Resolved absolute project path */
  projectPath: string;
  /** ISO 8601 timestamp of when this identity was created */
  createdAt: string;
}

/**
 * Sub-agent identity for v0.2.0 unified identity management
 */
export interface SubagentIdentity {
  /** Deterministic ID: sha256(rootAgentId + subagentType).substring(0, 32) */
  agentId: string;
  /** Root agent's ID (parent) */
  parentId: string;
  /** Sub-agent type identifier (e.g., "explore", "plan", "general-purpose") */
  subagentType: string;
  /** ISO 8601 timestamp of when this identity was created */
  createdAt: string;
}

/**
 * Unified agent identity type
 *
 * Discriminated union that represents either a root agent or a sub-agent.
 * Use the `isSubagent` field to determine which type it is.
 */
export type AgentIdentity =
  | (RootIdentity & { isSubagent: false })
  | (SubagentIdentity & { isSubagent: true });

/** Bucket name pattern: loom-identity-{projectId} */
const IDENTITY_BUCKET_PREFIX = 'loom-identity-';

/** Maximum retry attempts for loading identity */
const MAX_RETRIES = 10;

/** Base delay between retries in milliseconds (linear backoff) */
const RETRY_DELAY_MS = 100;

/**
 * Check if running as a sub-agent by looking for LOOMINAL_SUBAGENT_TYPE env var
 *
 * @returns `true` if running as a sub-agent, `false` if running as a root agent
 */
export function isSubagent(): boolean {
  return !!process.env.LOOMINAL_SUBAGENT_TYPE;
}

/**
 * Get the sub-agent type from environment, or undefined if root agent
 *
 * @returns The sub-agent type string if running as a sub-agent, `undefined` otherwise
 */
export function getSubagentType(): string | undefined {
  return process.env.LOOMINAL_SUBAGENT_TYPE;
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Milliseconds to sleep
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the identity KV bucket for a project
 *
 * @param nc - NATS connection
 * @param projectId - Project identifier (opaque hash of project path)
 * @returns KV bucket instance, or null if bucket doesn't exist
 */
async function getIdentityBucket(nc: NatsConnection, projectId: string): Promise<KV | null> {
  const js = nc.jetstream();
  const bucketName = `${IDENTITY_BUCKET_PREFIX}${projectId}`;

  try {
    const bucket = await js.views.kv(bucketName);
    logger.debug('Found identity bucket', { bucket: bucketName });
    return bucket;
  } catch (err) {
    const error = err as Error;
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      logger.debug('Identity bucket not found', { bucket: bucketName });
      return null;
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Get root identity from the bucket
 *
 * @param bucket - Identity KV bucket
 * @returns RootIdentity if found, null otherwise
 */
async function getRootIdentity(bucket: KV): Promise<RootIdentity | null> {
  try {
    const entry = await bucket.get('root');
    if (!entry || !entry.value) {
      logger.debug('Root identity key not found');
      return null;
    }

    const identity = JSON.parse(new TextDecoder().decode(entry.value)) as RootIdentity;
    logger.debug('Retrieved root identity', {
      agentId: identity.agentId,
      hostname: identity.hostname,
    });
    return identity;
  } catch (err) {
    const error = err as Error;
    // Key not found is not an error, return null
    if (error.message?.includes('not found') || error.message?.includes('no message found')) {
      logger.debug('Root identity key not found');
      return null;
    }
    logger.error('Failed to get root identity', { error: error.message });
    throw new Error(`Failed to get root identity: ${error.message}`);
  }
}

/**
 * Get sub-agent identity from the bucket
 *
 * @param bucket - Identity KV bucket
 * @param subagentType - Sub-agent type identifier (e.g., "explore", "plan")
 * @returns SubagentIdentity if found, null otherwise
 */
async function getSubagentIdentity(
  bucket: KV,
  subagentType: string
): Promise<SubagentIdentity | null> {
  const key = `subagent/${subagentType}`;

  try {
    const entry = await bucket.get(key);
    if (!entry || !entry.value) {
      logger.debug('Sub-agent identity not found', { subagentType });
      return null;
    }

    const identity = JSON.parse(new TextDecoder().decode(entry.value)) as SubagentIdentity;
    logger.debug('Retrieved sub-agent identity', {
      agentId: identity.agentId,
      subagentType: identity.subagentType,
      parentId: identity.parentId,
    });
    return identity;
  } catch (err) {
    const error = err as Error;
    // Key not found is not an error, return null
    if (error.message?.includes('not found') || error.message?.includes('no message found')) {
      logger.debug('Sub-agent identity not found', { subagentType });
      return null;
    }
    logger.error('Failed to get sub-agent identity', { subagentType, error: error.message });
    throw new Error(`Failed to get sub-agent identity for ${subagentType}: ${error.message}`);
  }
}

/**
 * Load identity from NATS KV with retry logic
 *
 * This function reads agent identity from Warp's NATS KV store. Since Warp may
 * not have written the identity yet when Pattern starts, this function implements
 * retry logic with exponential backoff.
 *
 * For root agents:
 * - Reads from the `root` key in the identity bucket
 *
 * For sub-agents (LOOMINAL_SUBAGENT_TYPE is set):
 * - Reads from the `subagent/{type}` key
 * - If not found, derives identity from root identity + subagent type
 *
 * @param nc - NATS connection
 * @param projectId - Project identifier
 * @returns Agent identity (root or sub-agent)
 * @throws Error if identity not found after max retries
 */
export async function loadIdentity(nc: NatsConnection, projectId: string): Promise<AgentIdentity> {
  const subagentType = getSubagentType();
  const isSubagentMode = isSubagent();

  logger.info('Loading identity', {
    projectId,
    isSubagent: isSubagentMode,
    subagentType,
  });

  // Retry loop with linear backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Try to get the identity bucket
      const bucket = await getIdentityBucket(nc, projectId);

      if (!bucket) {
        // Bucket doesn't exist yet - Warp hasn't initialized
        if (attempt < MAX_RETRIES) {
          const delay = attempt * RETRY_DELAY_MS;
          logger.debug('Identity bucket not found, retrying', {
            attempt,
            maxRetries: MAX_RETRIES,
            delayMs: delay,
          });
          await sleep(delay);
          continue;
        } else {
          throw new Error(
            'Identity not found - ensure Warp is running and has initialized identity'
          );
        }
      }

      // Get root identity (required for both root and sub-agents)
      const rootIdentity = await getRootIdentity(bucket);

      if (!rootIdentity) {
        // Root identity not found yet
        if (attempt < MAX_RETRIES) {
          const delay = attempt * RETRY_DELAY_MS;
          logger.debug('Root identity not found, retrying', {
            attempt,
            maxRetries: MAX_RETRIES,
            delayMs: delay,
          });
          await sleep(delay);
          continue;
        } else {
          throw new Error(
            'Identity not found - ensure Warp is running and has initialized identity'
          );
        }
      }

      // If running as root agent, return root identity
      if (!isSubagentMode) {
        logger.info('Loaded root identity', { agentId: rootIdentity.agentId });
        return { ...rootIdentity, isSubagent: false as const };
      }

      // Running as sub-agent - try to get sub-agent identity
      if (!subagentType) {
        throw new Error('LOOMINAL_SUBAGENT_TYPE is set but empty');
      }

      const subagentIdentity = await getSubagentIdentity(bucket, subagentType);

      if (!subagentIdentity) {
        // Sub-agent identity not found - derive it from root identity
        // This is a fallback in case Warp didn't write the sub-agent identity
        logger.warn('Sub-agent identity not found, deriving from root', {
          subagentType,
          rootAgentId: rootIdentity.agentId,
        });

        // We can't compute the hash here (no crypto import), so we'll create
        // a placeholder that includes the parent ID
        const derivedIdentity: SubagentIdentity = {
          agentId: `${rootIdentity.agentId.substring(0, 16)}-${subagentType.substring(0, 15)}`,
          parentId: rootIdentity.agentId,
          subagentType,
          createdAt: new Date().toISOString(),
        };

        logger.info('Loaded derived sub-agent identity', {
          agentId: derivedIdentity.agentId,
          subagentType: derivedIdentity.subagentType,
        });

        return { ...derivedIdentity, isSubagent: true as const };
      }

      logger.info('Loaded sub-agent identity', {
        agentId: subagentIdentity.agentId,
        subagentType: subagentIdentity.subagentType,
      });

      return { ...subagentIdentity, isSubagent: true as const };
    } catch (err) {
      const error = err as Error;
      // If this is the final attempt or a non-retryable error, throw
      if (attempt === MAX_RETRIES || !error.message?.includes('not found')) {
        logger.error('Failed to load identity', {
          error: error.message,
          attempt,
          maxRetries: MAX_RETRIES,
        });
        throw error;
      }

      // Retry on "not found" errors
      const delay = attempt * RETRY_DELAY_MS;
      logger.debug('Error loading identity, retrying', {
        error: error.message,
        attempt,
        maxRetries: MAX_RETRIES,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }

  // Should never reach here due to throw in loop, but TypeScript needs it
  throw new Error('Failed to load identity after maximum retries');
}
