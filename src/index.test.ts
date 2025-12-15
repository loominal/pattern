/**
 * Tests for index.ts CLI functions
 * Note: We test the exported pure functions. The main() function is integration-level
 * and is exercised through server tests and actual CLI usage.
 */

import { describe, it, expect } from 'vitest';
import { parseArgs, getVersionString, getHelpString } from './index.js';

describe('parseArgs', () => {
  it('should return false for both flags with empty args', () => {
    const result = parseArgs([]);

    expect(result.showVersion).toBe(false);
    expect(result.showHelp).toBe(false);
  });

  it('should detect --version flag', () => {
    const result = parseArgs(['--version']);

    expect(result.showVersion).toBe(true);
    expect(result.showHelp).toBe(false);
  });

  it('should detect -v flag', () => {
    const result = parseArgs(['-v']);

    expect(result.showVersion).toBe(true);
    expect(result.showHelp).toBe(false);
  });

  it('should detect --help flag', () => {
    const result = parseArgs(['--help']);

    expect(result.showVersion).toBe(false);
    expect(result.showHelp).toBe(true);
  });

  it('should detect -h flag', () => {
    const result = parseArgs(['-h']);

    expect(result.showVersion).toBe(false);
    expect(result.showHelp).toBe(true);
  });

  it('should detect both flags when present', () => {
    const result = parseArgs(['--version', '--help']);

    expect(result.showVersion).toBe(true);
    expect(result.showHelp).toBe(true);
  });

  it('should ignore unknown flags', () => {
    const result = parseArgs(['--unknown', '-x', 'arg']);

    expect(result.showVersion).toBe(false);
    expect(result.showHelp).toBe(false);
  });

  it('should detect flags among other args', () => {
    const result = parseArgs(['--foo', '-v', 'bar']);

    expect(result.showVersion).toBe(true);
    expect(result.showHelp).toBe(false);
  });
});

describe('getVersionString', () => {
  it('should return version string', () => {
    const version = getVersionString();

    expect(version).toBe('Pattern MCP Server v0.1.0');
  });

  it('should contain "Pattern"', () => {
    const version = getVersionString();

    expect(version).toContain('Pattern');
  });

  it('should contain version number', () => {
    const version = getVersionString();

    expect(version).toMatch(/v\d+\.\d+\.\d+/);
  });
});

describe('getHelpString', () => {
  it('should return non-empty help string', () => {
    const help = getHelpString();

    expect(help.length).toBeGreaterThan(0);
  });

  it('should contain USAGE section', () => {
    const help = getHelpString();

    expect(help).toContain('USAGE:');
  });

  it('should contain OPTIONS section', () => {
    const help = getHelpString();

    expect(help).toContain('OPTIONS:');
  });

  it('should contain ENVIRONMENT VARIABLES section', () => {
    const help = getHelpString();

    expect(help).toContain('ENVIRONMENT VARIABLES:');
  });

  it('should contain EXAMPLES section', () => {
    const help = getHelpString();

    expect(help).toContain('EXAMPLES:');
  });

  it('should document --version flag', () => {
    const help = getHelpString();

    expect(help).toContain('--version');
    expect(help).toContain('-v');
  });

  it('should document --help flag', () => {
    const help = getHelpString();

    expect(help).toContain('--help');
    expect(help).toContain('-h');
  });

  it('should document NATS_URL env var', () => {
    const help = getHelpString();

    expect(help).toContain('NATS_URL');
  });

  it('should document PROJECT_ID env var', () => {
    const help = getHelpString();

    expect(help).toContain('LOOMINAL_PROJECT_ID');
  });

  it('should document AGENT_ID env var', () => {
    const help = getHelpString();

    expect(help).toContain('LOOMINAL_AGENT_ID');
  });

  it('should contain github link', () => {
    const help = getHelpString();

    expect(help).toContain('https://github.com/loominal/pattern');
  });
});
