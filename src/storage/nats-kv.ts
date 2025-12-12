/**
 * NATS KV storage backend implementation
 * Based on PLAN.md section 11.0.2 and warp/src/kv.ts patterns
 */

import {
  connect as connectTcp,
  type NatsConnection,
  type KV,
  type ConnectionOptions,
  StorageType,
  DiscardPolicy,
} from 'nats';
import type { Memory } from '../types.js';
import { PatternError, PatternErrorCode } from '../types.js';
import type { StorageBackend } from './interface.js';
import { createLogger } from '../logger.js';

const logger = createLogger('nats-kv-backend');

/**
 * Parsed NATS URL components
 */
interface ParsedNatsUrl {
  server: string;
  user?: string;
  pass?: string;
  transport: 'tcp' | 'websocket';
}

/**
 * Parse a NATS URL that may contain credentials
 * Based on warp/src/nats.ts parseNatsUrl()
 */
function parseNatsUrl(url: string): ParsedNatsUrl {
  const transport =
    url.toLowerCase().startsWith('wss://') || url.toLowerCase().startsWith('ws://')
      ? 'websocket'
      : 'tcp';

  try {
    let normalizedUrl: string;
    if (url.startsWith('nats://')) {
      normalizedUrl = url.replace(/^nats:\/\//, 'http://');
    } else if (url.startsWith('tls://')) {
      normalizedUrl = url.replace(/^tls:\/\//, 'https://');
    } else if (url.startsWith('wss://')) {
      normalizedUrl = url.replace(/^wss:\/\//, 'https://');
    } else if (url.startsWith('ws://')) {
      normalizedUrl = url.replace(/^ws:\/\//, 'http://');
    } else {
      normalizedUrl = `http://${url}`;
    }

    const parsed = new URL(normalizedUrl);

    let server: string;
    if (transport === 'websocket') {
      const protocol = url.toLowerCase().startsWith('ws://') ? 'ws' : 'wss';
      server = `${protocol}://${parsed.host}${parsed.pathname}${parsed.search}`;
    } else {
      server = `nats://${parsed.host}`;
    }

    const result: ParsedNatsUrl = { server, transport };

    if (parsed.username) {
      result.user = decodeURIComponent(parsed.username);
    }
    if (parsed.password) {
      result.pass = decodeURIComponent(parsed.password);
    }

    return result;
  } catch {
    return { server: url, transport };
  }
}

/**
 * Initialize WebSocket shim for Node.js
 */
async function initWebSocketShim(): Promise<void> {
  const ws = await import('ws');
  (globalThis as unknown as { WebSocket: typeof ws.default }).WebSocket = ws.default;
}

/**
 * Connect using WebSocket transport
 */
async function connectWebSocket(opts: ConnectionOptions): Promise<NatsConnection> {
  await initWebSocketShim();
  const { connect: connectWs } = await import('nats.ws');
  return connectWs(opts);
}

/**
 * NATS KV backend implementation
 *
 * Bucket naming: loom-pattern-{projectId}
 * Key format: {scope}/{category}/{memoryId} or agents/{agentId}/{category}/{memoryId}
 */
export class NatsKvBackend implements StorageBackend {
  private connection: NatsConnection | null = null;
  private buckets: Map<string, KV> = new Map();
  private natsUrl: string;

  constructor(natsUrl: string) {
    this.natsUrl = natsUrl;
  }

  async connect(): Promise<void> {
    if (this.connection) {
      logger.debug('Already connected to NATS');
      return;
    }

    // Parse URL for credentials and transport
    const parsed = parseNatsUrl(this.natsUrl);

    // Build connection options
    const opts: ConnectionOptions = {
      servers: parsed.server,
      name: 'pattern-storage',
    };

    // Add authentication if present
    if (parsed.user && parsed.pass) {
      opts.user = parsed.user;
      opts.pass = parsed.pass;
      logger.debug('Connecting to NATS with authentication', {
        server: parsed.server,
        transport: parsed.transport,
      });
    } else {
      // Fallback to environment variables
      const envUser = process.env.NATS_USER;
      const envPass = process.env.NATS_PASS;
      if (envUser && envPass) {
        opts.user = envUser;
        opts.pass = envPass;
        logger.debug('Using NATS credentials from environment variables');
      }
    }

    try {
      // Connect based on transport type
      if (parsed.transport === 'websocket') {
        this.connection = await connectWebSocket(opts);
      } else {
        this.connection = await connectTcp(opts);
      }

      logger.info('Connected to NATS', {
        server: parsed.server,
        transport: parsed.transport,
        authenticated: !!(opts.user && opts.pass),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to connect to NATS', { error: err.message });
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        `Failed to connect to NATS: ${err.message}`,
        { server: parsed.server }
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.drain();
      this.connection = null;
      this.buckets.clear();
      logger.info('Disconnected from NATS');
    }
  }

  isConnected(): boolean {
    return this.connection !== null && !this.connection.isClosed();
  }

  /**
   * Ensure bucket exists for a project
   */
  async ensureBucket(projectId: string): Promise<void> {
    if (!this.connection) {
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        'Not connected to NATS. Call connect() first.'
      );
    }

    const bucketName = `loom-pattern-${projectId}`;

    // Check if already cached
    if (this.buckets.has(bucketName)) {
      return;
    }

    const js = this.connection.jetstream();
    const jsm = await js.jetstreamManager();

    try {
      // Try to get existing bucket
      const bucket = await js.views.kv(bucketName);
      this.buckets.set(bucketName, bucket);
      logger.debug('Using existing KV bucket', { bucket: bucketName });
    } catch (err) {
      const error = err as Error;
      // Bucket doesn't exist, create it
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        logger.info('Creating new KV bucket', { bucket: bucketName });

        try {
          await jsm.streams.add({
            name: `KV_${bucketName}`,
            subjects: [`$KV.${bucketName}.>`],
            storage: StorageType.File,
            max_age: 0, // No global TTL, we set per-key TTL
            allow_rollup_hdrs: true,
            deny_delete: false,
            deny_purge: false,
            allow_direct: true,
            discard: DiscardPolicy.Old,
            num_replicas: 1,
          });

          const bucket = await js.views.kv(bucketName);
          this.buckets.set(bucketName, bucket);
          logger.info('Created KV bucket', { bucket: bucketName });
        } catch (createErr) {
          const createError = createErr as Error;
          // Handle race condition
          if (
            createError.message?.includes('already in use') ||
            createError.message?.includes('exists')
          ) {
            const bucket = await js.views.kv(bucketName);
            this.buckets.set(bucketName, bucket);
            logger.debug('Bucket created by concurrent process', { bucket: bucketName });
          } else {
            throw createError;
          }
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Get bucket for a project (throws if not initialized)
   */
  private getBucket(projectId: string): KV {
    const bucketName = `loom-pattern-${projectId}`;
    const bucket = this.buckets.get(bucketName);
    if (!bucket) {
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        `Bucket not initialized for project ${projectId}. Call ensureBucket() first.`
      );
    }
    return bucket;
  }

  async get(_key: string): Promise<Memory | null> {
    // Extract projectId from memory to get correct bucket
    // Key format: shared/{category}/{memoryId} or agents/{agentId}/{category}/{memoryId}
    // We need to know the projectId, which should be in the Memory object
    // For now, we'll throw an error if called without context
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      'get() requires projectId context. Use getFromProject() instead.'
    );
  }

  async set(_key: string, memory: Memory, ttl?: number): Promise<void> {
    const bucket = this.getBucket(memory.projectId);

    try {
      const payload = JSON.stringify(memory);
      const key = _key; // Use the provided key

      // Note: NATS KV does not support per-key TTL in the put() API.
      // TTL is managed at the stream level when creating the bucket.
      // For now, we just store the memory. In V2, we could:
      // 1. Create separate buckets for TTL vs non-TTL memories
      // 2. Use a cleanup background job to delete expired memories
      // 3. Store expiresAt in the memory object and check on retrieval
      await bucket.put(key, payload);

      if (ttl) {
        logger.debug('Stored memory (TTL managed by application)', {
          key,
          ttl,
          projectId: memory.projectId,
        });
      } else {
        logger.debug('Stored memory', {
          key,
          projectId: memory.projectId,
        });
      }
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to set memory', { key: _key, error: error.message });
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        `Failed to set memory: ${error.message}`,
        { key: _key }
      );
    }
  }

  async delete(_key: string): Promise<boolean> {
    // Similar issue as get() - we need projectId context
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      'delete() requires projectId context. Use deleteFromProject() instead.'
    );
  }

  async list(_prefix: string): Promise<Memory[]> {
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      'list() requires projectId context. Use listFromProject() instead.'
    );
  }

  async keys(_prefix: string): Promise<string[]> {
    throw new PatternError(
      PatternErrorCode.VALIDATION_ERROR,
      'keys() requires projectId context. Use keysFromProject() instead.'
    );
  }

  /**
   * Get a memory by key from a specific project
   */
  async getFromProject(key: string, projectId: string): Promise<Memory | null> {
    const bucket = this.getBucket(projectId);

    try {
      const entry = await bucket.get(key);

      if (!entry || !entry.value) {
        return null;
      }

      // Check if the value is empty (deleted entry)
      const valueStr = entry.string();
      if (!valueStr || valueStr.trim() === '') {
        return null;
      }

      const data = JSON.parse(valueStr) as Memory;
      logger.debug('Retrieved memory', { key, projectId });
      return data;
    } catch (err) {
      const error = err as Error;
      if (
        error.message?.includes('not found') ||
        error.message?.includes('no message found') ||
        error.message?.includes('Unexpected end of JSON input')
      ) {
        logger.debug('Memory not found', { key, projectId });
        return null;
      }
      logger.error('Failed to get memory', { key, projectId, error: error.message });
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        `Failed to get memory: ${error.message}`,
        { key, projectId }
      );
    }
  }

  /**
   * Delete a memory by key from a specific project
   */
  async deleteFromProject(key: string, projectId: string): Promise<boolean> {
    const bucket = this.getBucket(projectId);

    try {
      // First check if the key exists
      const exists = await this.getFromProject(key, projectId);
      if (!exists) {
        logger.debug('Memory not found for deletion', { key, projectId });
        return false;
      }

      // Delete the key
      await bucket.delete(key);
      logger.debug('Deleted memory', { key, projectId });
      return true;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to delete memory', { key, projectId, error: error.message });
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        `Failed to delete memory: ${error.message}`,
        { key, projectId }
      );
    }
  }

  /**
   * List all memories matching a prefix from a specific project
   */
  async listFromProject(prefix: string, projectId: string): Promise<Memory[]> {
    const bucket = this.getBucket(projectId);
    const memories: Memory[] = [];

    try {
      // Collect all keys first to avoid iterator corruption
      const keyIterator = await bucket.keys();
      const keyArray: string[] = [];
      for await (const key of keyIterator) {
        if (key.startsWith(prefix)) {
          keyArray.push(key);
        }
      }

      logger.debug('Collected keys from bucket', {
        keyCount: keyArray.length,
        prefix,
        projectId,
      });

      // Now safely retrieve each memory
      for (const key of keyArray) {
        try {
          const memory = await this.getFromProject(key, projectId);
          if (memory) {
            memories.push(memory);
          }
        } catch (err) {
          const error = err as Error;
          logger.warn('Failed to get memory during list', {
            key,
            projectId,
            error: error.message,
          });
          // Continue with other memories
        }
      }

      logger.debug('Listed memories', { count: memories.length, prefix, projectId });
      return memories;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to list memories', {
        prefix,
        projectId,
        error: error.message,
      });
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        `Failed to list memories: ${error.message}`,
        { prefix, projectId }
      );
    }
  }

  /**
   * List all keys matching a prefix from a specific project
   */
  async keysFromProject(prefix: string, projectId: string): Promise<string[]> {
    const bucket = this.getBucket(projectId);
    const keys: string[] = [];

    try {
      const keyIterator = await bucket.keys();
      for await (const key of keyIterator) {
        if (key.startsWith(prefix)) {
          keys.push(key);
        }
      }

      logger.debug('Listed keys', { count: keys.length, prefix, projectId });
      return keys;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to list keys', {
        prefix,
        projectId,
        error: error.message,
      });
      throw new PatternError(
        PatternErrorCode.NATS_ERROR,
        `Failed to list keys: ${error.message}`,
        { prefix, projectId }
      );
    }
  }
}
