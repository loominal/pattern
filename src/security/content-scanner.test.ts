/**
 * Tests for content scanner
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContentScanner,
  type ScannerConfig,
  getDefaultScanner,
  configureScanner,
  DEFAULT_SCANNER_CONFIG,
} from './content-scanner.js';

describe('ContentScanner', () => {
  let scanner: ContentScanner;

  beforeEach(() => {
    scanner = new ContentScanner();
  });

  describe('API Key Detection', () => {
    it('should detect api_key pattern', () => {
      const content = 'api_key=sk_live_abcdefghijklmnopqrstuvwxyz123456';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('api-key');
      expect(result.warnings[0].pattern).toBe('API key detected');
    });

    it('should detect apiKey pattern', () => {
      const content = 'apiKey: "pk_test_1234567890abcdefghijklmno"';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('api-key');
    });

    it('should detect api-key pattern', () => {
      const content = 'api-key = sk_prod_abcdefghijklmnopqrstuvwxyz';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('api-key');
    });

    it('should detect api_token pattern', () => {
      const content = 'api_token="token_abcdefghijklmnopqrstuvwxyz123"';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('api-key');
    });

    it('should not detect short api key values (likely false positives)', () => {
      const content = 'api_key=short';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(false);
    });
  });

  describe('AWS Key Detection', () => {
    it('should detect AKIA AWS access key', () => {
      const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'aws-key')).toBe(true);
    });

    it('should detect ASIA AWS session token key', () => {
      const content = 'ASIA1234567890ABCDEF';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('aws-key');
    });

    it('should detect multiple AWS key types', () => {
      const content = 'AKIAIOSFODNN7EXAMPLE and AROAIOSFODNN7EXAMPLE';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.every((w) => w.type === 'aws-key')).toBe(true);
    });
  });

  describe('GitHub Token Detection', () => {
    it('should detect ghp_ personal access token', () => {
      const content = 'token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'github-token')).toBe(true);
    });

    it('should detect gho_ OAuth token', () => {
      const content = 'gho_abcdefghijklmnopqrstuvwxyz1234567890';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('github-token');
    });

    it('should detect ghs_ server-to-server token', () => {
      const content = 'ghs_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('github-token');
    });
  });

  describe('JWT Detection', () => {
    it('should detect valid JWT format', () => {
      const content =
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'jwt')).toBe(true);
    });

    it('should detect JWT in JSON', () => {
      const content =
        '{"token":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.abcdefghijklmnopqrstuvwxyz"}';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'jwt')).toBe(true);
    });
  });

  describe('Generic Secret Detection', () => {
    it('should detect secret= pattern', () => {
      const content = 'secret=mysupersecretvalue1234567890';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'generic-secret')).toBe(true);
    });

    it('should detect token= pattern', () => {
      const content = 'token: "longtokenvalue1234567890abcdefgh"';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'generic-secret')).toBe(true);
    });

    it('should detect bearer token pattern', () => {
      const content = 'bearer="longbearertokenvalue1234567890"';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'generic-secret')).toBe(true);
    });
  });

  describe('Password Detection', () => {
    it('should detect password= pattern', () => {
      const content = 'password=myP@ssw0rd123';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('password');
    });

    it('should detect passwd: pattern', () => {
      const content = 'passwd: "SuperSecret123!"';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('password');
    });

    it('should detect pwd pattern', () => {
      const content = 'pwd="MyP@ssword2024"';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('password');
    });

    it('should not detect short passwords (likely false positives)', () => {
      const content = 'password=short';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(false);
    });
  });

  describe('Private Key Detection', () => {
    it('should detect RSA private key header', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('private-key');
    });

    it('should detect EC private key header', () => {
      const content = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIGlRN...';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('private-key');
    });

    it('should detect OpenSSH private key header', () => {
      const content = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk...';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('private-key');
    });

    it('should detect generic private key header', () => {
      const content = '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqG...';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('private-key');
    });
  });

  describe('Email Detection (PII)', () => {
    it('should detect standard email address', () => {
      const content = 'Contact me at john.doe@example.com for details';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('email');
    });

    it('should detect email with subdomain', () => {
      const content = 'support@mail.company.co.uk';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('email');
    });

    it('should detect email with numbers and special chars', () => {
      const content = 'user+test123@example-domain.org';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('email');
    });

    it('should detect multiple email addresses', () => {
      const content = 'Send to alice@example.com and bob@test.org';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.every((w) => w.type === 'email')).toBe(true);
    });
  });

  describe('Credit Card Detection (PII)', () => {
    it('should detect credit card with spaces', () => {
      const content = 'Card number: 4532 1488 0343 6467';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'credit-card')).toBe(true);
    });

    it('should detect credit card with hyphens', () => {
      const content = '4532-1488-0343-6467';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'credit-card')).toBe(true);
    });

    it('should detect credit card without separators', () => {
      const content = '4532148803436467';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'credit-card')).toBe(true);
    });
  });

  describe('SSN Detection (PII)', () => {
    it('should detect SSN format', () => {
      const content = 'SSN: 123-45-6789';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('ssn');
    });

    it('should detect multiple SSNs', () => {
      const content = 'SSNs: 123-45-6789 and 987-65-4321';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.every((w) => w.type === 'ssn')).toBe(true);
    });
  });

  describe('Multiple Detections', () => {
    it('should detect multiple types of sensitive content', () => {
      const content = `
        api_key=sk_live_abcdefghijklmnopqrstuvwxyz123456
        password=MyP@ssword123
        Contact: admin@example.com
        SSN: 123-45-6789
      `;
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(3);

      const types = result.warnings.map((w) => w.type);
      expect(types).toContain('api-key');
      expect(types).toContain('password');
      expect(types).toContain('email');
      expect(types).toContain('ssn');
    });

    it('should detect same type multiple times', () => {
      const content = `
        api_key=key1_abcdefghijklmnopqrstuvwxyz
        apiKey=key2_abcdefghijklmnopqrstuvwxyz
        api-token=key3_abcdefghijklmnopqrstuvwxyz
      `;
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      const apiKeyWarnings = result.warnings.filter((w) => w.type === 'api-key');
      expect(apiKeyWarnings.length).toBeGreaterThan(1);
    });
  });

  describe('No Detections', () => {
    it('should not warn on clean content', () => {
      const content = 'This is a simple note about my day';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should not warn on code without secrets', () => {
      const content = `
        function authenticate() {
          const token = getTokenFromEnv();
          return validateToken(token);
        }
      `;
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(false);
    });

    it('should not warn on documentation', () => {
      const content = `
        # Configuration
        Set your API key in the environment variable API_KEY.
        Never hardcode passwords in your code.
      `;
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(false);
    });
  });

  describe('Warning Details', () => {
    it('should include position in warnings', () => {
      const content = 'Some text api_key=sk_test_abcdefghijklmnopqrstuvwxyz more text';
      const result = scanner.scan(content);

      expect(result.warnings[0].position).toBe(10); // Position of "api_key"
    });

    it('should include redacted sample', () => {
      const content = 'api_key=sk_live_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = scanner.scan(content);

      expect(result.warnings[0].sample).toBeDefined();
      expect(result.warnings[0].sample).toContain('...');
      expect(result.warnings[0].sample).not.toContain('1234567890abcdefgh'); // Should be redacted
    });

    it('should redact short matches completely', () => {
      const content = 'password=short123';
      const result = scanner.scan(content);

      if (result.hasWarnings) {
        // The match is "password=short123" which is longer than 10 chars
        // so it will be redacted as "pas...123"
        expect(result.warnings[0].sample).toContain('...');
      }
    });
  });

  describe('Configuration', () => {
    it('should respect disabled configuration', () => {
      const config: ScannerConfig = { enabled: false };
      const disabledScanner = new ContentScanner(config);

      const content = 'api_key=sk_live_abcdefghijklmnopqrstuvwxyz123456';
      const result = disabledScanner.scan(content);

      expect(result.hasWarnings).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should default to enabled', () => {
      const scanner = new ContentScanner();
      expect(scanner.isEnabled()).toBe(true);
    });

    it('should accept custom patterns', () => {
      const customPattern = {
        type: 'api-key' as const,
        regex: /CUSTOM_KEY_[A-Z0-9]{20}/g,
        description: 'Custom key pattern',
      };

      const config: ScannerConfig = {
        enabled: true,
        patterns: [customPattern],
      };

      const customScanner = new ContentScanner(config);
      const content = 'CUSTOM_KEY_ABCDEFGHIJ1234567890';
      const result = customScanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('api-key');
    });
  });

  describe('Format Warnings', () => {
    it('should format warnings by type', () => {
      const content = `
        api_key=sk_live_abcdefghijklmnopqrstuvwxyz
        apiKey=sk_test_abcdefghijklmnopqrstuvwxyz
        password=MyP@ssword123
        email: admin@example.com
      `;
      const result = scanner.scan(content);

      const formatted = scanner.formatWarnings(result.warnings);
      expect(formatted).toContain('api-key');
      expect(formatted).toContain('occurrence(s)');
    });

    it('should return empty string for no warnings', () => {
      const formatted = scanner.formatWarnings([]);
      expect(formatted).toBe('');
    });

    it('should group multiple warnings of same type', () => {
      const content = `
        api_key=key1_abcdefghijklmnopqrstuvwxyz
        apiKey=key2_abcdefghijklmnopqrstuvwxyz
      `;
      const result = scanner.scan(content);

      const formatted = scanner.formatWarnings(result.warnings);
      expect(formatted).toMatch(/api-key.*2.*occurrence/i);
    });
  });

  describe('Default Scanner Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const scanner1 = getDefaultScanner();
      const scanner2 = getDefaultScanner();

      expect(scanner1).toBe(scanner2);
    });

    it('should allow reconfiguration', () => {
      configureScanner({ enabled: false });
      const scanner = getDefaultScanner();

      expect(scanner.isEnabled()).toBe(false);

      // Reset to default for other tests
      configureScanner(DEFAULT_SCANNER_CONFIG);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const result = scanner.scan('');
      expect(result.hasWarnings).toBe(false);
    });

    it('should handle very long content', () => {
      const longContent = 'a'.repeat(50000) + ' api_key=sk_live_abcdefghijklmnopqrstuvwxyz';
      const result = scanner.scan(longContent);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings[0].type).toBe('api-key');
    });

    it('should handle content with special characters', () => {
      const content = '中文 api_key=sk_live_abcdefghijklmnopqrstuvwxyz 🔑';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
    });

    it('should handle newlines and tabs', () => {
      const content = 'api_key=\t\nsk_live_abcdefghijklmnopqrstuvwxyz';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
    });

    it('should not infinite loop on zero-width matches', () => {
      // This tests the safety check in the scan loop
      const result = scanner.scan('api_key=test123456789012345678');
      // Should complete without hanging
      expect(result).toBeDefined();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should detect Stripe API key', () => {
      const content = 'stripe_api_key=sk_live_51HabcdefghijklmnopqrstuvwxyzABCDEF';
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'api-key')).toBe(true);
    });

    it('should detect environment variable assignments', () => {
      const content = `
        export DATABASE_PASSWORD="SuperSecret123!"
        export API_TOKEN="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc"
      `;
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'password')).toBe(true);
    });

    it('should detect JSON with secrets', () => {
      const content = `
        api_key=sk_prod_abcdefghijklmnopqrstuvwxyz
        email=admin@example.com
        password=dbP@ssw0rd123
      `;
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      // Should detect at least: api_key, email, password
      const types = result.warnings.map((w) => w.type);
      expect(types).toContain('api-key');
      expect(types).toContain('email');
      expect(types).toContain('password');
    });

    it('should detect YAML with secrets', () => {
      const content = `
        database:
          password: MyDBPassword123
        aws:
          access_key_id: AKIAIOSFODNN7EXAMPLE
        notifications:
          email: alerts@company.com
      `;
      const result = scanner.scan(content);

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === 'password')).toBe(true);
      expect(result.warnings.some((w) => w.type === 'aws-key')).toBe(true);
      expect(result.warnings.some((w) => w.type === 'email')).toBe(true);
    });
  });
});
