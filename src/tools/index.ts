/**
 * MCP tools for Pattern
 * Tool definitions and handler registry
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { NatsKvBackend } from '../storage/nats-kv.js';

// Export all tool handlers and types
export * from './remember.js';
export * from './remember-task.js';
export * from './remember-learning.js';
export * from './commit-insight.js';
export * from './core-memory.js';
export * from './forget.js';
export * from './share-learning.js';
export * from './cleanup.js';
export * from './recall-context.js';
export * from './export-memories.js';
export * from './import-memories.js';

// Import handlers for dispatcher
import { remember, type RememberInput } from './remember.js';
import { rememberTask, type RememberTaskInput } from './remember-task.js';
import { rememberLearning, type RememberLearningInput } from './remember-learning.js';
import { commitInsight, type CommitInsightInput } from './commit-insight.js';
import { coreMemory, type CoreMemoryInput } from './core-memory.js';
import { forget, type ForgetInput } from './forget.js';
import { shareLearning, type ShareLearningInput } from './share-learning.js';
import { cleanup, type CleanupInput } from './cleanup.js';
import { recallContext, type RecallContextInput } from './recall-context.js';
import { exportMemories, type ExportMemoriesInput } from './export-memories.js';
import { importMemories, type ImportMemoriesInput } from './import-memories.js';

/**
 * MCP Tool definitions following the MCP specification
 */
export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'remember',
    description:
      'Store a new memory with specified scope and category. Use this to remember important information, tasks, or learnings.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to remember (max 32KB)',
        },
        scope: {
          type: 'string',
          enum: ['private', 'shared'],
          description:
            'Memory scope: private (agent-specific) or shared (project-wide). Default: private',
        },
        category: {
          type: 'string',
          enum: ['recent', 'tasks', 'longterm', 'core', 'decisions', 'architecture', 'learnings'],
          description:
            'Memory category. Private: recent (24h), tasks (24h), longterm, core. Shared: decisions, architecture, learnings. Default: recent',
        },
        metadata: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization (max 10 tags, 50 chars each)',
            },
            priority: {
              type: 'number',
              enum: [1, 2, 3],
              description: 'Priority level: 1=high, 2=medium, 3=low',
            },
            relatedTo: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related memory IDs',
            },
            source: {
              type: 'string',
              description: 'Source of this memory',
            },
          },
          description: 'Optional metadata for the memory',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'remember-task',
    description:
      'Quick shorthand to remember a task (private scope, tasks category, 24h TTL). Use this for current work items.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Task description to remember (max 32KB)',
        },
        metadata: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization',
            },
            priority: {
              type: 'number',
              enum: [1, 2, 3],
              description: 'Priority level: 1=high, 2=medium, 3=low',
            },
            relatedTo: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related memory IDs',
            },
            source: {
              type: 'string',
              description: 'Source of this memory',
            },
          },
          description: 'Optional metadata',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'remember-learning',
    description:
      'Quick shorthand to remember a learning or insight (private scope, recent category, 24h TTL). Use this for temporary notes.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Learning or insight to remember (max 32KB)',
        },
        metadata: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization',
            },
            priority: {
              type: 'number',
              enum: [1, 2, 3],
              description: 'Priority level: 1=high, 2=medium, 3=low',
            },
            relatedTo: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related memory IDs',
            },
            source: {
              type: 'string',
              description: 'Source of this memory',
            },
          },
          description: 'Optional metadata',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'commit-insight',
    description:
      'Promote a temporary memory (recent/tasks) to permanent storage (longterm). Use this when a temporary insight proves valuable.',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'string',
          description: 'UUID of the memory to promote',
        },
        newContent: {
          type: 'string',
          description: 'Optional: Update the content when promoting',
        },
      },
      required: ['memoryId'],
    },
  },
  {
    name: 'core-memory',
    description:
      'Store identity-defining memory in the core category (no TTL, protected). Use sparingly for fundamental agent characteristics. Max 100 core memories per agent.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Core identity content to remember (max 32KB)',
        },
        metadata: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization',
            },
            priority: {
              type: 'number',
              enum: [1, 2, 3],
              description: 'Priority level: 1=high, 2=medium, 3=low',
            },
            relatedTo: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related memory IDs',
            },
            source: {
              type: 'string',
              description: 'Source of this memory',
            },
          },
          description: 'Optional metadata',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'forget',
    description:
      'Delete a memory by ID. Requires force=true for core memories. Can only delete your own private or shared memories.',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'string',
          description: 'UUID of the memory to delete',
        },
        force: {
          type: 'boolean',
          description: 'Required for deleting core memories',
        },
      },
      required: ['memoryId'],
    },
  },
  {
    name: 'recall-context',
    description:
      'Retrieve memory context at session start. Returns prioritized memories by category (core first, then longterm, decisions, etc.) with a 4KB summary.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['private', 'shared', 'both'],
          description:
            'Which memories to retrieve: private (agent-only), shared (project-wide), or both. Default: both',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['recent', 'tasks', 'longterm', 'core', 'decisions', 'architecture', 'learnings'],
          },
          description: 'Filter by categories. Empty array returns all categories.',
        },
        limit: {
          type: 'number',
          description: 'Max memories to return (default: 50, max: 200)',
        },
        since: {
          type: 'string',
          description: 'ISO 8601 timestamp - only return memories updated after this time',
        },
      },
    },
  },
  {
    name: 'share-learning',
    description:
      'Share a private memory with all project agents. Only longterm and core memories can be shared. Creates a copy in shared scope.',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'string',
          description: 'UUID of the private memory to share',
        },
        category: {
          type: 'string',
          enum: ['decisions', 'architecture', 'learnings'],
          description: 'Target shared category. Default: learnings',
        },
        keepPrivate: {
          type: 'boolean',
          description:
            'If true, keep the original private memory. If false, move it (delete private). Default: false',
        },
      },
      required: ['memoryId'],
    },
  },
  {
    name: 'cleanup',
    description:
      'Run maintenance tasks: expire TTL memories and enforce storage limits. Should be called periodically.',
    inputSchema: {
      type: 'object',
      properties: {
        expireOnly: {
          type: 'boolean',
          description: 'If true, only expire TTL memories without enforcing limits. Default: false',
        },
      },
    },
  },
  {
    name: 'export-memories',
    description:
      'Export memories to a JSON file for backup or transfer. Supports filtering by scope, category, and date range.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Optional file path for export (default: memories-backup-TIMESTAMP.json)',
        },
        scope: {
          type: 'string',
          enum: ['private', 'personal', 'team', 'public'],
          description: 'Filter by scope',
        },
        category: {
          type: 'string',
          enum: ['recent', 'tasks', 'longterm', 'core', 'decisions', 'architecture', 'learnings'],
          description: 'Filter by category',
        },
        since: {
          type: 'string',
          description: 'ISO 8601 timestamp - only export memories updated after this date',
        },
        includeExpired: {
          type: 'boolean',
          description: 'Include expired memories (default: false)',
        },
      },
    },
  },
  {
    name: 'import-memories',
    description:
      'Import memories from a JSON backup file. Validates format and allows overwriting existing memories.',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: {
          type: 'string',
          description: 'Path to JSON backup file',
        },
        overwriteExisting: {
          type: 'boolean',
          description: 'Overwrite if memory ID already exists (default: false)',
        },
        skipInvalid: {
          type: 'boolean',
          description: 'Skip invalid entries instead of failing (default: true)',
        },
      },
      required: ['inputPath'],
    },
  },
];

/**
 * Tool handler context
 */
export interface ToolContext {
  agentId: string;
  projectId: string;
  storage: NatsKvBackend;
  isSubagent?: boolean;
  parentId?: string;
  config?: import('../types.js').PatternConfig;
}

/**
 * Handle a tool call by dispatching to the appropriate handler
 * @param name - Tool name
 * @param args - Tool arguments
 * @param context - Tool execution context
 * @returns Tool result
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  const { agentId, projectId, storage, config } = context;

  switch (name) {
    case 'remember':
      return remember(args as unknown as RememberInput, storage, projectId, agentId, config);

    case 'remember-task':
      return rememberTask(
        args as unknown as RememberTaskInput,
        storage,
        projectId,
        agentId,
        config
      );

    case 'remember-learning':
      return rememberLearning(
        args as unknown as RememberLearningInput,
        storage,
        projectId,
        agentId,
        config
      );

    case 'commit-insight':
      return commitInsight(args as unknown as CommitInsightInput, storage, projectId, agentId);

    case 'core-memory':
      return coreMemory(args as unknown as CoreMemoryInput, storage, projectId, agentId, config);

    case 'forget':
      return forget(args as unknown as ForgetInput, storage, projectId, agentId);

    case 'recall-context': {
      const subagentInfo =
        context.isSubagent && context.parentId
          ? { isSubagent: true, parentId: context.parentId }
          : undefined;
      return recallContext(
        storage,
        projectId,
        agentId,
        args as unknown as RecallContextInput,
        subagentInfo
      );
    }

    case 'share-learning':
      return shareLearning(args as unknown as ShareLearningInput, storage, projectId, agentId);

    case 'cleanup':
      return cleanup(args as unknown as CleanupInput, storage, projectId);

    case 'export-memories':
      return exportMemories(args as unknown as ExportMemoriesInput, storage, projectId, agentId);

    case 'import-memories':
      return importMemories(args as unknown as ImportMemoriesInput, storage, projectId, agentId);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
