<!-- BEGIN MICROSOFT SECURITY.MD V1.0.0 BLOCK -->

## Security

Microsoft takes the security of our software products and services seriously, which
includes all source code repositories in our GitHub organizations.

**Please do not report security vulnerabilities through public GitHub issues.**

For security reporting information, locations, contact information, and policies,
please review the latest guidance for Microsoft repositories at
[https://aka.ms/SECURITY.md](https://aka.ms/SECURITY.md).

<!-- END MICROSOFT SECURITY.MD BLOCK -->

---

# Capybara Security Best Practices

This section provides security guidelines specific to the Capybara project.

## For Contributors

### Never Commit Sensitive Information

**Never commit these to the repository:**

- API keys, tokens, or passwords
- Private keys or certificates (`.key`, `.pem`, `.p12`, `.pfx`)
- Environment files with secrets (`.env`, `.env.local`)
- Credentials files (`credentials.json`, `secrets.json`)
- Personal access tokens or AWS access keys

### Use Environment Variables for Secrets

When building signed releases locally, **always use environment variables**:

```bash
# Example: Local signed build
export CERTIFICATE_PASSWORD="your_password"
export APPLE_TEAM_ID="ABCD123456"
export APPLE_ID="your@email.com"
export APPLE_ID_PASSWORD="xxxx-xxxx-xxxx-xxxx"

./scripts/build-signed-local.sh
```

**Never hardcode credentials in scripts or configuration files.**

### Pre-commit Checklist

Before committing, verify:

- [ ] No API keys or tokens in code
- [ ] No hardcoded passwords or secrets
- [ ] No certificate files staged
- [ ] No `.env` files with real values
- [ ] Run `git status` and review all changes

### Certificate Management

For Apple code signing:

1. Store certificates in `~/apple/` (ignored by git)
2. Use strong passwords for certificate protection
3. Pass credentials via environment variables only
4. Never commit `.p12` or certificate files

Example workflow:

```bash
# One-time setup: Export certificate
./scripts/prepare-certificate.sh

# Before each build: Set environment variables
export CERTIFICATE_PASSWORD="your_password"
export APPLE_TEAM_ID="your_team_id"
export APPLE_ID="your@email.com"
export APPLE_ID_PASSWORD="app_specific_password"

# Run signed build
./scripts/build-signed-local.sh
```

### Dependency Security

Keep dependencies secure and up to date:

```bash
# Audit dependencies
npm audit

# Fix vulnerabilities
npm audit fix

# Update packages
npm update
```

### Code Review Security Checklist

When reviewing PRs, check:

- [ ] No hardcoded credentials
- [ ] No API keys or tokens
- [ ] Environment variables used for secrets
- [ ] No debugging credentials left in code
- [ ] No sensitive file paths exposed

## Security Tools

Recommended tools for preventing secret leaks:

```bash
# Install git-secrets
brew install git-secrets
git secrets --install
git secrets --register-aws

# Install gitleaks
brew install gitleaks
gitleaks detect --verbose
```

## CI/CD Security

When configuring CI/CD:

- Store secrets in GitHub Secrets or secure vaults
- Never log sensitive values
- Use minimal permission scopes
- Rotate secrets regularly

## For End Users

1. Download Capybara from official sources only
2. Verify DMG signatures before installing
3. Keep the application updated
4. Report suspicious behavior immediately

---

**Security Contact**: Report vulnerabilities through GitHub Security Advisories or by creating a private security report.

**Last Updated**: 2026-01-22
