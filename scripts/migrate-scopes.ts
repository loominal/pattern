#!/usr/bin/env node
/**
 * Migration script to convert old scope values to new unified scope model
 *
 * This script migrates Pattern memories from the old scope model to the new unified model:
 * - Old 'private' -> New 'private' (no change)
 * - Old 'shared' -> New 'team' (renamed)
 *
 * Usage:
 *   npm run migrate-scopes -- --nats-url nats://localhost:4222 --project-id <projectId> [--dry-run]
 *
 * Options:
 *   --nats-url <url>      NATS server URL (default: nats://localhost:4222)
 *   --project-id <id>     Project ID to migrate
 *   --dry-run             Preview changes without applying them
 *   --help                Show this help message
 */

import { migrateToUnifiedScope, type LoominalScope } from '@loominal/shared/types';
import { NatsKvBackend } from '../src/storage/nats-kv.js';
import type { Memory } from '../src/types.js';

interface MigrationOptions {
  natsUrl: string;
  projectId: string;
  dryRun: boolean;
}

interface MigrationStats {
  totalMemories: number;
  migratedMemories: number;
  unchangedMemories: number;
  errors: number;
  scopeChanges: Record<string, number>;
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions | null {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Migration script for Pattern scope unification

Usage:
  npm run migrate-scopes -- [options]

Options:
  --nats-url <url>      NATS server URL (default: nats://localhost:4222)
  --project-id <id>     Project ID to migrate (required)
  --dry-run             Preview changes without applying them
  --help, -h            Show this help message

Examples:
  # Dry run to preview changes
  npm run migrate-scopes -- --project-id my-project --dry-run

  # Actually perform migration
  npm run migrate-scopes -- --project-id my-project --nats-url nats://localhost:4222
    `);
    return null;
  }

  let natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
  let projectId = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--nats-url' && i + 1 < args.length) {
      natsUrl = args[i + 1];
      i++;
    } else if (arg === '--project-id' && i + 1 < args.length) {
      projectId = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  if (!projectId) {
    console.error('Error: --project-id is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  return { natsUrl, projectId, dryRun };
}

/**
 * Migrate a single memory's scope
 */
function migrateScopeForMemory(memory: Memory): { changed: boolean; newScope: LoominalScope } {
  const oldScope = memory.scope;

  try {
    const newScope = migrateToUnifiedScope(oldScope);
    const changed = oldScope !== newScope;
    return { changed, newScope };
  } catch (error) {
    console.error(`Failed to migrate scope for memory ${memory.id}: ${error}`);
    return { changed: false, newScope: oldScope };
  }
}

/**
 * Run the migration
 */
async function runMigration(options: MigrationOptions): Promise<void> {
  const { natsUrl, projectId, dryRun } = options;

  console.log('='.repeat(60));
  console.log('Pattern Scope Migration Tool');
  console.log('='.repeat(60));
  console.log(`NATS URL:    ${natsUrl}`);
  console.log(`Project ID:  ${projectId}`);
  console.log(`Mode:        ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MIGRATION'}`);
  console.log('='.repeat(60));
  console.log();

  // Initialize storage
  const storage = new NatsKvBackend(natsUrl);
  await storage.connect();
  await storage.ensureBucket(projectId);

  const stats: MigrationStats = {
    totalMemories: 0,
    migratedMemories: 0,
    unchangedMemories: 0,
    errors: 0,
    scopeChanges: {},
  };

  try {
    // Fetch all memories in the project
    console.log('Fetching all memories from project...');
    const allMemories = await storage.listFromProject('', projectId);
    stats.totalMemories = allMemories.length;
    console.log(`Found ${allMemories.length} memories\n`);

    // Process each memory
    for (const memory of allMemories) {
      const { changed, newScope } = migrateScopeForMemory(memory);

      if (!changed) {
        stats.unchangedMemories++;
        continue;
      }

      // Track scope change
      const changeKey = `${memory.scope} -> ${newScope}`;
      stats.scopeChanges[changeKey] = (stats.scopeChanges[changeKey] || 0) + 1;

      console.log(`Memory ${memory.id}:`);
      console.log(`  Category: ${memory.category}`);
      console.log(`  Old scope: ${memory.scope}`);
      console.log(`  New scope: ${newScope}`);

      if (!dryRun) {
        try {
          // Update the memory
          memory.scope = newScope;
          memory.updatedAt = new Date().toISOString();

          // Re-save the memory (in the same location for now)
          // Note: This doesn't move memories between buckets yet
          // That would require additional logic to handle bucket migration
          await storage.set(`agents/${memory.agentId}/${memory.category}/${memory.id}`, memory);

          stats.migratedMemories++;
          console.log(`  ✓ Migrated successfully\n`);
        } catch (error) {
          stats.errors++;
          console.error(`  ✗ Error migrating: ${error}\n`);
        }
      } else {
        stats.migratedMemories++;
        console.log(`  [DRY RUN] Would migrate\n`);
      }
    }

    // Print summary
    console.log('='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total memories:      ${stats.totalMemories}`);
    console.log(`Migrated:            ${stats.migratedMemories}`);
    console.log(`Unchanged:           ${stats.unchangedMemories}`);
    console.log(`Errors:              ${stats.errors}`);
    console.log();
    console.log('Scope changes:');
    for (const [change, count] of Object.entries(stats.scopeChanges)) {
      console.log(`  ${change}: ${count} memories`);
    }
    console.log('='.repeat(60));

    if (dryRun) {
      console.log('\n✓ Dry run completed. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✓ Migration completed successfully.');
    }

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await storage.disconnect();
  }
}

// Main entry point
const options = parseArgs();
if (options) {
  runMigration(options).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
