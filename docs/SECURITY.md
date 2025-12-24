# Security Best Practices for Pattern

## Overview

Pattern provides hierarchical memory storage for AI agents using NATS JetStream as the backend. While Pattern includes several security features (scope isolation, access controls, content scanning), **users are responsible for protecting sensitive data**.

This document explains:
- What Pattern protects against (and what it doesn't)
- How to handle sensitive data safely
- Security best practices for different use cases
- Incident response guidance

## Threat Model

### What Pattern Protects Against

✅ **Cross-Agent Memory Access**
- Private memories are isolated by agent ID
- Personal memories follow only the creating agent
- Team memories are isolated by project
- Sub-agents cannot access parent's personal (core) memories

✅ **Accidental Secret Storage** (v0.3.1+)
- Content scanner detects common secret patterns
- Warnings issued before storing credentials, API keys, etc.
- Opt-out available via `PATTERN_DISABLE_CONTENT_SCAN`

✅ **Unauthorized Project Access**
- Project isolation via project ID (derived from working directory)
- Team memories only visible within the same project
- Cross-project access requires explicit `public` scope

### What Pattern Does NOT Protect Against

❌ **Data at Rest Encryption**
- NATS KV stores content in **plaintext** by default
- Anyone with NATS server access can read all memories
- **Mitigation**: Use client-side encryption (see below)

❌ **Network Eavesdropping** (without TLS)
- Plain `nats://` connections send data unencrypted
- **Mitigation**: Use `wss://` (WebSocket with TLS) or `tls://` protocol

❌ **Malicious Agent Behavior**
- Pattern trusts agents to respect scope boundaries
- Compromised agent could share private memories to team scope
- **Mitigation**: Run untrusted agents in isolated projects

❌ **NATS Server Security**
- Pattern relies on NATS authentication and authorization
- No additional encryption layer on top of NATS
- **Mitigation**: Secure your NATS deployment (see below)

## Data Storage Security

### Storage Location by Scope

| Scope | NATS Bucket | Accessible By | Encryption |
|-------|-------------|---------------|------------|
| `private` | `loom-pattern-{projectId}` | Same agent, same project | None (plaintext) |
| `personal` | `loom-pattern-user-{userId}` | Same agent, all projects | None (plaintext) |
| `team` | `loom-pattern-{projectId}` | All agents in project | None (plaintext) |
| `public` | `loom-pattern-global` | All agents everywhere | None (plaintext) |

### NATS Server Security

**Recommendations**:

1. **Enable Authentication**
   ```bash
   # Use credentials in URL
   export NATS_URL="nats://user:pass@localhost:4222"

   # Or environment variables
   export NATS_USER="pattern-client"
   export NATS_PASS="secure-password"
   ```

2. **Enable TLS/SSL**
   ```bash
   # For WebSocket with TLS
   export NATS_URL="wss://user:pass@nats.example.com"

   # For TCP with TLS
   export NATS_URL="tls://user:pass@nats.example.com:4222"
   ```

3. **Configure NATS Authorization**
   - Restrict which clients can access which buckets
   - Limit permissions to specific subject patterns
   - See [NATS Authorization Guide](https://docs.nats.io/running-a-nats-service/configuration/securing_nats/authorization)

4. **Network Isolation**
   - Run NATS on private network
   - Use firewall rules to restrict access
   - Consider VPN for remote agents

## What NOT to Store in Memories

### Never Store

🚫 **Credentials and Secrets**
- Passwords, API keys, tokens
- Private SSH keys, certificates
- Database connection strings with credentials
- OAuth secrets, webhook signing keys

🚫 **Personally Identifiable Information (PII)**
- Social Security Numbers, passport numbers
- Credit card numbers, bank account details
- Medical records, health information
- Biometric data

🚫 **Proprietary Code or Data**
- Source code with embedded secrets
- Customer data, financial records
- Trade secrets, unreleased product info

### Use Caution

⚠️ **Reference Information**
- File paths, URLs (may reveal system structure)
- Usernames, email addresses (consider privacy)
- Configuration details (may aid attackers)

**Best Practice**: Store references to secrets, not the secrets themselves.

**Good**:
```json
{
  "content": "API credentials stored in 1Password vault 'DevOps'"
}
```

**Bad**:
```json
{
  "content": "API key: sk_live_abc123xyz..."
}
```

## Content Scanning (v0.3.1+)

Pattern includes an opt-in content scanner that detects common secret patterns:

### Detected Patterns

- API keys and tokens (AWS, GitHub, Stripe, etc.)
- Passwords in common formats
- Private keys (RSA, SSH, PGP)
- Database connection strings
- JWT tokens, OAuth secrets
- Credit card numbers
- Email addresses (in certain contexts)

### How It Works

```typescript
// When you call remember()
remember({
  content: "My GitHub token is ghp_abc123xyz",
  scope: "private",
  category: "recent"
})

// Pattern warns but does not block:
// ⚠️  WARNING: Possible secret detected in content:
//    - GitHub Personal Access Token (line 1)
//    Consider storing this in a secure vault instead.
```

### Disabling Content Scanning

If you encounter false positives or prefer to manage security yourself:

```bash
export PATTERN_DISABLE_CONTENT_SCAN=true
```

**Note**: Content scanning is a safety net, not a guarantee. Always review what you're storing.

## Client-Side Encryption

For sensitive content that must be stored, use client-side encryption:

### Example: Encrypting Content

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Encryption function
function encryptContent(content: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(content, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Prepend IV for decryption
  return iv.toString('base64') + ':' + encrypted;
}

// Decryption function
function decryptContent(encrypted: string, key: Buffer): string {
  const [ivBase64, ciphertext] = encrypted.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Usage with Pattern
const encryptionKey = Buffer.from(process.env.PATTERN_ENCRYPTION_KEY!, 'hex');

// Store encrypted
const sensitiveData = "Database password: secret123";
const encrypted = encryptContent(sensitiveData, encryptionKey);

await remember({
  content: encrypted,
  scope: "private",
  category: "longterm",
  metadata: {
    tags: ["encrypted"],
    source: "encrypted-secret"
  }
});

// Retrieve and decrypt
const memories = await recallContext({ categories: ["longterm"] });
const encryptedMemory = memories.private.find(m =>
  m.metadata?.tags?.includes("encrypted")
);

if (encryptedMemory) {
  const decrypted = decryptContent(encryptedMemory.content, encryptionKey);
  console.log(decrypted); // "Database password: secret123"
}
```

### Key Management

**Store encryption keys securely**:
- ✅ Environment variables (for local development)
- ✅ Secret management services (AWS Secrets Manager, HashiCorp Vault)
- ✅ Hardware security modules (HSM) for production
- ❌ Never commit keys to version control
- ❌ Never store keys in Pattern memories

## Access Control Best Practices

### Scope Selection Guide

| Use Case | Recommended Scope | Reasoning |
|----------|-------------------|-----------|
| Debug notes, temp observations | `private` | No need to share |
| Personal preferences, identity | `personal` | Follows you across projects |
| Project decisions, architecture | `team` | All project agents benefit |
| Public templates, knowledge | `public` | Useful to broader community |

### Sub-Agent Memory Access

Sub-agents (spawned for specialized tasks) have restricted access:

| Parent Scope | Sub-Agent Access | Use Case |
|--------------|------------------|----------|
| `private` (`recent`, `tasks`, `longterm`) | Read-only | Sub-agents can see context |
| `personal` (`core`) | **No access** | Identity protection |
| `team` | Read-write | Collaboration |
| `public` | Read-write | Shared knowledge |

**Security Implication**: Never store secrets in `private` scope if sub-agents are untrusted.

### Multi-Agent Scenarios

**When sharing a machine with other users**:
- Each user gets a separate `personal` bucket (isolated by user ID)
- `team` scope memories are shared across all agents in the same project directory
- Use different project directories for different trust levels

**When running agents on different machines**:
- Set `LOOMINAL_AGENT_ID` consistently to share the same agent identity
- Use `personal` scope for memories that should follow the agent
- Use `team` scope for project-specific knowledge

## Incident Response

### If You Accidentally Store Sensitive Data

1. **Delete the memory immediately**
   ```typescript
   await forget({ memoryId: "the-memory-id", force: true });
   ```

2. **Rotate the compromised secret**
   - Change the password/token/key
   - Update any systems using the old secret
   - Revoke API keys if possible

3. **Check for sharing**
   ```bash
   # Search NATS KV for the secret (requires NATS CLI)
   nats kv get loom-pattern-{projectId} --all
   ```

4. **Consider NATS data purge** (if widely shared)
   ```bash
   # Delete entire bucket (loses all memories!)
   nats kv del loom-pattern-{projectId}
   ```

5. **Review access logs**
   - Check who had access to the NATS server
   - Review network logs for unusual activity
   - Assume the secret was compromised

### Prevention Checklist

Before storing any memory, ask:
- [ ] Does this contain credentials, secrets, or PII?
- [ ] Would I be comfortable sharing this with my project team?
- [ ] Is this something I'd commit to a public GitHub repo?
- [ ] Can I use a reference instead of the actual value?
- [ ] Should I encrypt this before storing?

## Security Monitoring

### Recommended Monitoring

1. **NATS Server Logs**
   - Monitor for unusual access patterns
   - Alert on failed authentication attempts
   - Track bucket size growth

2. **Memory Audit Trail**
   ```typescript
   // Periodically review what's stored
   const allMemories = await recallContext({
     scopes: ["private", "personal", "team"],
     limit: 1000
   });

   // Check for suspicious patterns
   allMemories.private.forEach(m => {
     if (m.content.includes("password") || m.content.includes("secret")) {
       console.warn("⚠️  Possible secret in memory:", m.id);
     }
   });
   ```

3. **Cleanup Automation**
   ```typescript
   // Regular cleanup of temporary memories
   await cleanup({ expireOnly: false });
   ```

## Security Configuration Checklist

### Development Environment

- [ ] NATS running on localhost only
- [ ] Basic authentication enabled (`NATS_USER`/`NATS_PASS`)
- [ ] Content scanning enabled (default)
- [ ] Regular cleanup scheduled

### Production Environment

- [ ] NATS running with TLS (`wss://` or `tls://`)
- [ ] Strong authentication and authorization configured
- [ ] Network isolation (private network/VPN)
- [ ] Content scanning enabled
- [ ] Encryption keys stored in secret manager
- [ ] Monitoring and alerting configured
- [ ] Backup/recovery plan documented
- [ ] Incident response plan in place

## Frequently Asked Questions

### Can other agents read my private memories?

**No**, if they're in different projects. Pattern uses project isolation (based on working directory hash). Same project = same team scope, but private scope is still agent-specific.

### What if my NATS server is compromised?

**All memories are readable**. NATS KV stores data in plaintext. Use client-side encryption for sensitive content, or don't store sensitive data at all.

### Should I use Pattern for production secrets?

**No**. Use dedicated secret management tools:
- AWS Secrets Manager, Azure Key Vault, GCP Secret Manager
- HashiCorp Vault
- 1Password, LastPass (for team secrets)
- Kubernetes Secrets (with encryption at rest)

Pattern is for **context and knowledge**, not **credentials**.

### How do I secure WebSocket connections?

Use `wss://` (WebSocket Secure) instead of `ws://`:
```bash
export NATS_URL="wss://user:pass@nats.example.com"
```

Ensure your NATS server has TLS certificates configured.

### What about compliance (GDPR, HIPAA, SOC2)?

Pattern **does not provide compliance guarantees**. For regulated data:
- Use client-side encryption
- Implement access logging and auditing
- Document data retention policies
- Ensure NATS infrastructure meets compliance standards
- Consult legal/compliance team before storing regulated data

## Additional Resources

- [NATS Security Documentation](https://docs.nats.io/running-a-nats-service/configuration/securing_nats)
- [Pattern Architecture Analysis](../ARCHITECTURE_ANALYSIS.md)
- [OWASP Secret Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

## Reporting Security Issues

If you discover a security vulnerability in Pattern:

1. **Do not** open a public GitHub issue
2. Email security details to: mike@lopresti.org
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue.

---

**Last Updated**: 2025-12-23
**Version**: 0.3.1
