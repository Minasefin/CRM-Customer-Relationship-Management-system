#!/usr/bin/env node
// Scans every file git tracks (or is about to commit) for things that look like
// secrets: API keys, tokens, private keys, passwords in URLs, .env and database files.
// Run before committing:   npm run check:secrets
// Also runs automatically on every pull request (.github/workflows/checks.yml).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const patterns = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/],
  ['OpenAI / Anthropic style key', /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe key', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/],
  ['Private key', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['Password in a URL', /[a-z]+:\/\/[^\s:/@'"]+:[^\s@'"]{3,}@/i],
  ['Hard-coded secret', /\b(api[_-]?key|secret|access[_-]?token|auth[_-]?token|password|passwd)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i],
];
const badFiles = [/(^|\/)\.dev-key$/, /(^|\/)\.env(\.|$)/, /\.(db|sqlite|sqlite3|db-journal|pem|key|p12|pfx)$/i, /(^|\/)id_(rsa|ed25519)$/];
const skip = [/^package-lock\.json$/, /^scripts\/check-secrets\.mjs$/, /\.(png|jpe?g|gif|ico|woff2?|ttf)$/i];

const staged = process.argv.includes('--staged');
const files = execSync(staged ? 'git diff --cached --name-only --diff-filter=ACM' : 'git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const problems = [];
for (const file of files) {
  if (badFiles.some((r) => r.test(file))) problems.push(`${file}: this kind of file should never be committed`);
  if (skip.some((r) => r.test(file))) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of patterns) {
      if (re.test(line)) problems.push(`${file}:${i + 1}: possible ${name}`);
    }
  });
}

if (problems.length) {
  console.error('Possible secrets found:\n  ' + problems.join('\n  '));
  console.error('\nRemove them before committing. If one is a false alarm, tell the team in your pull request.');
  process.exit(1);
}
console.log(`No secrets found in ${files.length} files.`);
