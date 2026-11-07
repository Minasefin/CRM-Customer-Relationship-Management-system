'use strict';
// Recovery key: a random code shown once, written down by the person. It unlocks a copy of
// the password-derived key material, so a forgotten password can be replaced. The code is
// never stored; only AES-256-GCM envelopes that need it (or the current password) to open.
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32: no 0, 1, 8 or 9
const MATERIAL = 'auria/recovery/material/v1';
const KEK = 'auria/recovery/kek/v1';

// 20 random bytes = 32 base32 characters (160 bits), shown in groups of 4.
function generate() {
  const bytes = randomBytes(20);
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out += ALPHABET[(value >>> bits) & 31]; }
  }
  bytes.fill(0);
  return out.match(/.{4}/g).join('-');
}
// What the person typed -> the canonical code, or '' if it can't be one.
// Spaces, dashes and case don't matter; 0/1/8 typed for O/I/B are forgiven.
function normalize(value) {
  const s = String(value || '').toUpperCase().replace(/[\s-]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B');
  return /^[A-Z2-7]{32}$/.test(s) ? s.match(/.{4}/g).join('-') : '';
}
function wrap(plain, key, label) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(label));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') };
}
function unwrap(envelope, key, label) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
  decipher.setAAD(Buffer.from(label));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'hex')), decipher.final()]);
}
const validEnvelope = (e, bytes) => !!e && /^[a-f0-9]{24}$/.test(e.iv) && /^[a-f0-9]{32}$/.test(e.tag) && typeof e.data === 'string' && e.data.length === bytes * 2 && /^[a-f0-9]+$/.test(e.data);
// { salt, material: 64-byte key material locked by the recovery code,
//   kek: the code-derived key locked by the current password's material (for password changes) }
const validRecord = (r) => !!r && typeof r === 'object' && /^[a-f0-9]{32}$/.test(r.salt) && validEnvelope(r.material, 64) && validEnvelope(r.kek, 32);

function seal(material, kek, salt) {
  return { salt, material: wrap(material, kek, MATERIAL), kek: wrap(kek, material.subarray(32), KEK) };
}
const openWithCode = (record, kek) => unwrap(record.material, kek, MATERIAL);
const openWithPassword = (record, material) => unwrap(record.kek, material.subarray(32), KEK);

module.exports = { generate, normalize, seal, openWithCode, openWithPassword, validRecord };
