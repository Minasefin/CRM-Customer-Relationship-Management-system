'use strict';
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const blocked = new Set(fs.readFileSync(path.join(__dirname, 'blocked-passwords.sha256'), 'utf8').trim().split(/\r?\n/));
// Public, predictable phrases, not credentials. Compare entire passwords only.
const contextual = new Set([
  'contractor crm', 'contractor crm password', 'contractorcrmpassword',
  'this is my password', 'thisismypassword', 'correct horse battery staple',
  'correcthorsebatterystaple', 'passwordpassword', 'passwordpasswordpassword',
  '123456789012345', '1234567890123456', 'qwertyuiopasdfgh',
]);

function normalize(value) {
  // Bound input before normalization/allocation; 128 Unicode code points can use 256 UTF-16 units.
  if (typeof value !== 'string' || value.length > 256 || value.length === 0 || !value.isWellFormed()) {
    throw new Error('Enter a password of 15 to 128 characters.');
  }
  const normalized = value.normalize('NFC');
  if ([...normalized].length > 128) throw new Error('Use no more than 128 characters.');
  return normalized;
}

function validateNewPassword(value) {
  const normalized = normalize(value);
  if ([...normalized].length < 15) throw new Error('Use at least 15 characters.');
  const lower = normalized.toLowerCase();
  const digest = createHash('sha256').update(lower).digest('hex');
  if (blocked.has(digest) || contextual.has(lower) || /^(.)\1+$/su.test(lower)) {
    throw new Error('This password is common, compromised, or easy to guess. Choose a different passphrase.');
  }
  return normalized;
}

module.exports = { normalize, validateNewPassword };
