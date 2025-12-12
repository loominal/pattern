/**
 * Agent identity and session management for Pattern
 * Tracks agent identity, project isolation, and session lifecycle
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from './logger.js';

const logger = createLogger('session');

/**
 * Get or create an agent ID from environment or generate a new one
 * Checks LOOMINAL_AGENT_ID env var, or generates a new UUID
 */
export function getOrCreateAgentId(): string {
  const envAgentId = process.env.LOOMINAL_AGENT_ID;

  if (envAgentId) {
    logger.debug('Using agent ID from LOOMINAL_AGENT_ID environment variable', { agentId: envAgentId });
    return envAgentId;
  }

  // Generate a new UUID for this agent
  const newAgentId = uuidv4();
  logger.info('Generated new agent ID', { agentId: newAgentId });
  logger.warn('No LOOMINAL_AGENT_ID set - generated ephemeral ID. Set LOOMINAL_AGENT_ID to persist identity.');

  return newAgentId;
}

/**
 * Get project ID from environment or return default
 * Checks LOOMINAL_PROJECT_ID env var, or returns "default"
 */
export function getProjectId(): string {
  const envProjectId = process.env.LOOMINAL_PROJECT_ID;

  if (envProjectId) {
    logger.debug('Using project ID from LOOMINAL_PROJECT_ID environment variable', { projectId: envProjectId });
    return envProjectId;
  }

  logger.debug('No LOOMINAL_PROJECT_ID set - using "default" project');
  return 'default';
}

/**
 * Agent session tracking
 * Manages agent identity, project scope, and session lifecycle
 */
export class AgentSession {
  public readonly agentId: string;
  public readonly projectId: string;
  public readonly sessionStart: Date;

  constructor(agentId?: string, projectId?: string) {
    this.agentId = agentId || getOrCreateAgentId();
    this.projectId = projectId || getProjectId();
    this.sessionStart = new Date();

    logger.info('Agent session initialized', {
      agentId: this.agentId,
      projectId: this.projectId,
      sessionStart: this.sessionStart.toISOString(),
    });
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration(): number {
    return Date.now() - this.sessionStart.getTime();
  }

  /**
   * Get session info as a formatted object
   */
  getSessionInfo(): {
    agentId: string;
    projectId: string;
    sessionStart: string;
    sessionDuration: number;
  } {
    return {
      agentId: this.agentId,
      projectId: this.projectId,
      sessionStart: this.sessionStart.toISOString(),
      sessionDuration: this.getSessionDuration(),
    };
  }

  /**
   * Log session summary
   */
  logSummary(): void {
    const duration = this.getSessionDuration();
    const durationSec = (duration / 1000).toFixed(2);

    logger.info('Session summary', {
      agentId: this.agentId,
      projectId: this.projectId,
      duration: `${durationSec}s`,
    });
  }
}
