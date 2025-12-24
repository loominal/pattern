# Content Scanning for Secrets and PII

## Overview

Pattern now includes built-in content scanning to detect secrets, API keys, passwords, and personally identifiable information (PII) before storing memories. This feature helps prevent accidental storage of sensitive data while maintaining a non-blocking workflow.

## Features

### Detection Patterns

The content scanner detects the following types of sensitive information:

**Secrets & Credentials:**
- API keys (`api_key=`, `apiKey:`, `api-key=`, `api_token=`)
- AWS access keys (AKIA, ASIA, AROA, etc.)
- GitHub tokens (ghp_, gho_, ghs_, ghr_, ghu_)
- JWT tokens
- Generic secrets (`secret=`, `token=`, `bearer=`)
- Passwords (`password=`, `passwd=`, `pwd=`)
- Private keys (RSA, EC, OpenSSH, generic)

**Personally Identifiable Information (PII):**
- Email addresses
- Credit card numbers
- Social Security Numbers (US format)

### Non-Blocking Design

**Important:** Content scanning is **non-blocking**. When sensitive information is detected:
- ⚠️ Warnings are logged to help you identify potential issues
- ✅ The memory is still stored successfully
- 📋 You receive a detailed report of what was detected
- 🔒 No data is modified or rejected

This design prevents false positives from blocking your workflow while still alerting you to potential security issues.

## Configuration

### Environment Variable

Content scanning is **enabled by default**. To disable it:

```bash
export PATTERN_CONTENT_SCANNING=false
```

### Programmatic Configuration

```typescript
import { PatternConfig } from '@loominal/pattern';

const config: PatternConfig = {
  natsUrl: 'nats://localhost:4222',
  projectId: 'my-project',
  contentScanning: {
    enabled: true  // or false to disable
  }
};
```

## Usage

Content scanning is automatically applied to all memory storage operations:

- `remember()` - All memories
- `remember-task()` - Task memories
- `remember-learning()` - Learning memories
- `core-memory()` - Core identity memories

### Example Warning Output

When sensitive content is detected, you'll see warnings like this:

```
[WARN] Content scanning detected 3 potential sensitive information warning(s):
[WARN]   - api-key: 1 occurrence(s)
  - password: 1 occurrence(s)
  - email: 1 occurrence(s)
[WARN] This is a non-blocking warning. The memory has been stored. Review the content to ensure no secrets or PII were accidentally included.
```

## Implementation Details

### Scanner Architecture

```
src/security/
├── content-scanner.ts              # Main scanner implementation
├── content-scanner.test.ts         # Unit tests (58 tests)
└── content-scanner-integration.test.ts  # Integration tests (15 tests)
```

**Key Components:**
- `ContentScanner` class - Main scanning engine with configurable patterns
- `ScanResult` interface - Contains warnings and detection metadata
- `ScanWarning` interface - Individual warning details with redacted samples
- Pattern detection via regular expressions
- Singleton instance for efficient reuse

### Pattern Matching

Patterns are designed to minimize false positives:
- Minimum length requirements (e.g., API keys must be 20+ chars)
- Context-aware matching (looks for `key=value` patterns)
- Specific format validation (AWS key prefixes, JWT structure, etc.)

### Redaction

Detected sensitive values are redacted in logs:
- Shows first 3 and last 3 characters: `sk_...xyz`
- Values ≤10 chars: `***REDACTED***`
- Prevents accidental exposure in log files

## Testing

### Test Coverage

- **Unit tests:** 58 tests covering all detection patterns
- **Integration tests:** 15 tests validating tool integration
- **Coverage:** 97.03% line coverage, 100% branch coverage

### Running Tests

```bash
# All security tests
npm test -- src/security/

# Specific test file
npm test -- src/security/content-scanner.test.ts

# With coverage
npm run test:coverage -- src/security/
```

## Best Practices

### For Users

1. **Review warnings** - Don't ignore scanner warnings; they indicate real risks
2. **Use environment variables** - Store secrets in env vars, not memories
3. **Reference by name** - Instead of storing `api_key=sk_live_xxx`, store `"Use API_KEY env var"`
4. **Sanitize before sharing** - Be extra careful with shared/team memories

### For Developers

1. **Add custom patterns** - Extend detection patterns for domain-specific secrets
2. **Test edge cases** - Ensure patterns don't block legitimate content
3. **Monitor logs** - Track warning frequency to identify training needs
4. **Update patterns** - Keep detection patterns current with new secret formats

## Custom Patterns

You can add custom detection patterns:

```typescript
import { ContentScanner, DetectionPattern } from '@loominal/pattern/security/content-scanner';

const customPattern: DetectionPattern = {
  type: 'api-key',
  regex: /CUSTOM_SECRET_[A-Z0-9]{32}/g,
  description: 'Custom secret format detected'
};

const scanner = new ContentScanner({
  enabled: true,
  patterns: [customPattern, ...DEFAULT_PATTERNS]
});
```

## Performance

- **Scanning overhead:** < 1ms for typical memory sizes (< 10KB)
- **Memory footprint:** Minimal - singleton pattern reuses compiled regexes
- **No blocking:** Zero impact on memory storage latency

## Security Considerations

### What This Does

✅ Warns about potential secrets/PII before storage
✅ Helps prevent accidental exposure
✅ Provides audit trail in logs
✅ Educates users about security risks

### What This Doesn't Do

❌ Does not prevent storage of sensitive data
❌ Does not guarantee 100% detection (false negatives possible)
❌ Does not modify or redact stored content
❌ Does not replace proper secrets management

### Recommendations

For production use:
1. Enable content scanning (default)
2. Monitor warning logs regularly
3. Use dedicated secrets management (e.g., Vault, AWS Secrets Manager)
4. Train users on secure memory practices
5. Implement additional safeguards at the application layer if needed

## Troubleshooting

### False Positives

If you're getting warnings for non-sensitive content:

1. **Review the pattern** - Check if the regex is too broad
2. **Disable scanning temporarily** - Set `PATTERN_CONTENT_SCANNING=false` for that session
3. **Customize patterns** - Replace default patterns with more specific ones
4. **Report issues** - Help improve the patterns by reporting false positives

### False Negatives

If secrets aren't being detected:

1. **Check pattern coverage** - Verify the secret format is in the pattern list
2. **Add custom patterns** - Extend with domain-specific patterns
3. **Review logs** - Ensure scanning is enabled and running
4. **Test manually** - Use the scanner directly to debug pattern matching

## Future Enhancements

Potential improvements for future releases:

- [ ] Machine learning-based detection for unknown secret formats
- [ ] Integration with external secret scanning services
- [ ] Configurable severity levels (warn vs. block)
- [ ] Custom redaction strategies
- [ ] Batch scanning for existing memories
- [ ] Automatic secret rotation recommendations
- [ ] Integration with secrets management systems

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
