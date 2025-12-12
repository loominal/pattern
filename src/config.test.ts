/**
 * Tests for config.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, validateConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default values when no env vars are set', () => {
    delete process.env.NATS_URL;
    delete process.env.PROJECT_ID;
    delete process.env.AGENT_ID;
    delete process.env.DEBUG;

    const config = loadConfig();

    expect(config.natsUrl).toBe('nats://localhost:4222');
    expect(config.projectId).toBe('default');
    expect(config.agentId).toBeUndefined();
    expect(config.debug).toBeUndefined();
  });

  it('should use NATS_URL env var when set', () => {
    process.env.NATS_URL = 'nats://custom-server:4222';

    const config = loadConfig();

    expect(config.natsUrl).toBe('nats://custom-server:4222');
  });

  it('should use PROJECT_ID env var when set', () => {
    process.env.PROJECT_ID = 'my-project';

    const config = loadConfig();

    expect(config.projectId).toBe('my-project');
  });

  it('should use AGENT_ID env var when set', () => {
    process.env.AGENT_ID = 'agent-123';

    const config = loadConfig();

    expect(config.agentId).toBe('agent-123');
  });

  it('should enable debug mode when DEBUG=true', () => {
    process.env.DEBUG = 'true';

    const config = loadConfig();

    expect(config.debug).toBe(true);
  });

  it('should not enable debug mode when DEBUG is not "true"', () => {
    process.env.DEBUG = 'false';

    const config = loadConfig();

    expect(config.debug).toBeUndefined();
  });

  it('should handle all env vars set together', () => {
    process.env.NATS_URL = 'wss://nats.example.com';
    process.env.PROJECT_ID = 'test-project';
    process.env.AGENT_ID = 'test-agent';
    process.env.DEBUG = 'true';

    const config = loadConfig();

    expect(config.natsUrl).toBe('wss://nats.example.com');
    expect(config.projectId).toBe('test-project');
    expect(config.agentId).toBe('test-agent');
    expect(config.debug).toBe(true);
  });
});

describe('validateConfig', () => {
  it('should not throw for valid config', () => {
    const config = {
      natsUrl: 'nats://localhost:4222',
      projectId: 'my-project',
    };

    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should throw when natsUrl is empty', () => {
    const config = {
      natsUrl: '',
      projectId: 'my-project',
    };

    expect(() => validateConfig(config)).toThrow('NATS_URL is required');
  });

  it('should throw when projectId is empty', () => {
    const config = {
      natsUrl: 'nats://localhost:4222',
      projectId: '',
    };

    expect(() => validateConfig(config)).toThrow('PROJECT_ID is required');
  });

  it('should accept config with optional fields', () => {
    const config = {
      natsUrl: 'nats://localhost:4222',
      projectId: 'my-project',
      agentId: 'agent-123',
      debug: true,
    };

    expect(() => validateConfig(config)).not.toThrow();
  });
});
