/**
 * Memory data model for Loom Pattern
 * Based on PLAN.md section 11.0.1
 */

import type { LoominalScope } from '@loominal/shared/types';

export type MemoryCategory =
  // Private categories
  | 'recent' // General short-term (24h TTL)
  | 'tasks' // Current work items (24h TTL)
  | 'longterm' // Permanent insights
  | 'core' // Identity-defining (protected)
  // Shared categories
  | 'decisions' // Project decisions
  | 'architecture' // Architecture choices
  | 'learnings'; // Shared knowledge

export interface MemoryMetadata {
  tags?: string[]; // Max 10 tags, 50 chars each
  priority?: 1 | 2 | 3; // 1=high, 3=low
  relatedTo?: string[]; // Related memory IDs
  source?: string; // Where this came from
}

export interface Memory {
  id: string; // UUID v4
  agentId: string; // Creator agent GUID
  projectId: string; // Project isolation
  scope: LoominalScope;
  category: MemoryCategory;
  content: string; // Max 32KB
  metadata?: MemoryMetadata;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  expiresAt?: string; // ISO 8601, for TTL memories
  version: number; // Schema version (1)
}

export interface RecallResult {
  private: Memory[];
  personal: Memory[];
  team: Memory[];
  public: Memory[];
  summary: string; // Concatenated key points
  counts: {
    private: number;
    personal: number;
    team: number;
    public: number;
    expired: number; // Recently expired (info only)
  };
}

/**
 * Configuration for Pattern server
 */
export interface PatternConfig {
  natsUrl: string;
  projectId: string;
  agentId?: string;
  debug?: boolean;
}

/**
 * Error codes for Pattern operations
 */
export enum PatternErrorCode {
  MEMORY_NOT_FOUND = 'MEMORY_NOT_FOUND', // 404
  ACCESS_DENIED = 'ACCESS_DENIED', // 403
  STORAGE_FULL = 'STORAGE_FULL', // 507
  INVALID_CATEGORY = 'INVALID_CATEGORY', // 400
  CORE_PROTECTED = 'CORE_PROTECTED', // 403
  NATS_ERROR = 'NATS_ERROR', // 503
  VALIDATION_ERROR = 'VALIDATION_ERROR', // 400
}

export class PatternError extends Error {
  constructor(
    public code: PatternErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PatternError';
  }
}

/**
 * Helper function to check if a category is shared
 */
export function isSharedCategory(category: MemoryCategory): boolean {
  return ['decisions', 'architecture', 'learnings'].includes(category);
}

/**
 * Helper function to check if a category has TTL
 */
export function hasTTL(category: MemoryCategory): boolean {
  return ['recent', 'tasks'].includes(category);
}

/**
 * Get the TTL in seconds for a category (or undefined if no TTL)
 */
export function getTTL(category: MemoryCategory): number | undefined {
  return hasTTL(category) ? 86400 : undefined; // 24 hours in seconds
}

/**
 * Validate scope and category combination
 */
export function validateScopeCategory(scope: LoominalScope, category: MemoryCategory): void {
  const teamCategories: MemoryCategory[] = ['decisions', 'architecture', 'learnings'];
  const individualCategories: MemoryCategory[] = ['recent', 'tasks', 'longterm', 'core'];

  // Team and public scopes should use team/shared categories
  if ((scope === 'team' || scope === 'public') && !teamCategories.includes(category)) {
    throw new PatternError(
      PatternErrorCode.INVALID_CATEGORY,
      `Category '${category}' is not valid for ${scope} scope. Use one of: ${teamCategories.join(', ')}`
    );
  }

  // Private and personal scopes should use individual categories
  if ((scope === 'private' || scope === 'personal') && !individualCategories.includes(category)) {
    throw new PatternError(
      PatternErrorCode.INVALID_CATEGORY,
      `Category '${category}' is not valid for ${scope} scope. Use one of: ${individualCategories.join(', ')}`
    );
  }
}
