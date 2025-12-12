/**
 * Configuration loading for Pattern server
 */

import type { PatternConfig } from './types.js';

export function loadConfig(): PatternConfig {
  const config: PatternConfig = {
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    projectId: process.env.PROJECT_ID || 'default',
  };

  if (process.env.AGENT_ID) {
    config.agentId = process.env.AGENT_ID;
  }

  if (process.env.DEBUG === 'true') {
    config.debug = true;
  }

  return config;
}

export function validateConfig(config: PatternConfig): void {
  if (!config.natsUrl) {
    throw new Error('NATS_URL is required');
  }

  if (!config.projectId) {
    throw new Error('PROJECT_ID is required');
  }
}
