/**
 * Content scanner for detecting secrets, API keys, and PII
 * Non-blocking security warnings for Pattern memory storage
 */

export interface ScanResult {
  hasWarnings: boolean;
  warnings: ScanWarning[];
}

export interface ScanWarning {
  type: DetectionType;
  pattern: string;
  position: number;
  sample: string; // Redacted sample for logging
}

export type DetectionType =
  | 'api-key'
  | 'password'
  | 'private-key'
  | 'email'
  | 'credit-card'
  | 'ssn'
  | 'aws-key'
  | 'github-token'
  | 'jwt'
  | 'generic-secret';

interface DetectionPattern {
  type: DetectionType;
  regex: RegExp;
  description: string;
}

/**
 * Detection patterns for sensitive content
 * Patterns are designed to minimize false positives while catching common formats
 */
const DETECTION_PATTERNS: DetectionPattern[] = [
  // API Keys and Tokens
  {
    type: 'api-key',
    regex: /(?:api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})/gi,
    description: 'API key detected',
  },
  {
    type: 'aws-key',
    regex: /(?:AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    description: 'AWS access key detected',
  },
  {
    type: 'github-token',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g,
    description: 'GitHub token detected',
  },
  {
    type: 'jwt',
    regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    description: 'JWT token detected',
  },
  {
    type: 'generic-secret',
    regex: /(?:secret|token|bearer)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})/gi,
    description: 'Generic secret detected',
  },

  // Passwords
  {
    type: 'password',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})/gi,
    description: 'Password detected',
  },

  // Private Keys
  {
    type: 'private-key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    description: 'Private key detected',
  },

  // PII - Email
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    description: 'Email address detected',
  },

  // PII - Credit Card (basic Luhn-valid pattern)
  {
    type: 'credit-card',
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    description: 'Possible credit card number detected',
  },

  // PII - Social Security Number (US format)
  {
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    description: 'Possible SSN detected',
  },
];

/**
 * Configuration for content scanning
 */
export interface ScannerConfig {
  enabled: boolean;
  patterns?: DetectionPattern[];
}

/**
 * Default scanner configuration
 */
export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  enabled: true,
};

/**
 * Content scanner class
 */
export class ContentScanner {
  private config: ScannerConfig;
  private patterns: DetectionPattern[];

  constructor(config: ScannerConfig = DEFAULT_SCANNER_CONFIG) {
    this.config = config;
    this.patterns = config.patterns || DETECTION_PATTERNS;
  }

  /**
   * Scan content for sensitive information
   * @param content - Content to scan
   * @returns Scan result with warnings (if any)
   */
  scan(content: string): ScanResult {
    if (!this.config.enabled) {
      return { hasWarnings: false, warnings: [] };
    }

    const warnings: ScanWarning[] = [];

    for (const pattern of this.patterns) {
      // Reset regex state for global patterns
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(content)) !== null) {
        const position = match.index;
        const matchText = match[0];

        // Create redacted sample for logging (show first/last few chars only)
        const sample = this.redactSample(matchText);

        warnings.push({
          type: pattern.type,
          pattern: pattern.description,
          position,
          sample,
        });

        // Prevent infinite loops on zero-width matches
        if (match.index === pattern.regex.lastIndex) {
          pattern.regex.lastIndex++;
        }
      }
    }

    return {
      hasWarnings: warnings.length > 0,
      warnings,
    };
  }

  /**
   * Redact a matched string for safe logging
   * Shows first 3 and last 3 characters, redacts the middle
   */
  private redactSample(text: string): string {
    if (text.length <= 10) {
      return '***REDACTED***';
    }
    const prefix = text.substring(0, 3);
    const suffix = text.substring(text.length - 3);
    return `${prefix}...${suffix}`;
  }

  /**
   * Format warnings for logging
   */
  formatWarnings(warnings: ScanWarning[]): string {
    if (warnings.length === 0) {
      return '';
    }

    const grouped = this.groupWarningsByType(warnings);
    const lines: string[] = [];

    for (const [type, typeWarnings] of Object.entries(grouped)) {
      lines.push(`  - ${type}: ${typeWarnings.length} occurrence(s)`);
    }

    return lines.join('\n');
  }

  /**
   * Group warnings by type for summary
   */
  private groupWarningsByType(warnings: ScanWarning[]): Record<string, ScanWarning[]> {
    return warnings.reduce<Record<string, ScanWarning[]>>(
      (acc, warning) => {
        if (!acc[warning.type]) {
          acc[warning.type] = [];
        }
        acc[warning.type]!.push(warning);
        return acc;
      },
      {}
    );
  }

  /**
   * Check if scanner is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Default singleton instance
 */
let defaultScanner: ContentScanner | null = null;

/**
 * Get or create the default scanner instance
 */
export function getDefaultScanner(): ContentScanner {
  if (defaultScanner === null) {
    defaultScanner = new ContentScanner();
  }
  return defaultScanner;
}

/**
 * Configure the default scanner
 */
export function configureScanner(config: ScannerConfig): void {
  defaultScanner = new ContentScanner(config);
}
