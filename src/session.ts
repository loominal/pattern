/**
 * Agent identity and session management for Pattern
 * Tracks agent identity, project isolation, and session lifecycle
 */

import { createLogger } from './logger.js';

const logger = createLogger('session');

/**
 * Agent session tracking
 * Manages agent identity, project scope, and session lifecycle
 * Identity is now loaded from Warp's NATS KV store via unified identity management
 */
export class AgentSession {
  public readonly agentId: string;
  public readonly projectId: string;
  public readonly isSubagent: boolean;
  public readonly parentId?: string;
  public readonly sessionStart: Date;

  constructor(agentId: string, projectId: string, isSubagent: boolean = false, parentId?: string) {
    // Validate required parameters
    if (!agentId || agentId.trim() === '') {
      throw new Error('agentId is required and cannot be empty');
    }
    if (!projectId || projectId.trim() === '') {
      throw new Error('projectId is required and cannot be empty');
    }
    if (isSubagent && !parentId) {
      throw new Error('parentId is required when isSubagent is true');
    }

    this.agentId = agentId;
    this.projectId = projectId;
    this.isSubagent = isSubagent;
    if (parentId !== undefined) {
      this.parentId = parentId;
    }
    this.sessionStart = new Date();

    logger.info('Agent session initialized', {
      agentId: this.agentId,
      projectId: this.projectId,
      isSubagent: this.isSubagent,
      parentId: this.parentId,
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
    isSubagent: boolean;
    parentId?: string;
    sessionStart: string;
    sessionDuration: number;
  } {
    return {
      agentId: this.agentId,
      projectId: this.projectId,
      isSubagent: this.isSubagent,
      ...(this.parentId !== undefined && { parentId: this.parentId }),
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
      isSubagent: this.isSubagent,
      parentId: this.parentId,
      duration: `${durationSec}s`,
    });
  }
}
