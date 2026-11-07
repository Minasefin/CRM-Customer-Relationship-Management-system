'use strict';
const { createHmac, randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } = require('node:crypto');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function token(secret, step, digits = 6, algorithm = 'sha1') {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac(algorithm, secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
function matchStep(secret, code, time, lastStep = -1) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const step = Math.floor(time / 30000);
  for (const candidate of [step, step - 1, step + 1]) {
    if (candidate >= 0 && candidate > lastStep && timingSafeEqual(Buffer.from(token(secret, candidate)), Buffer.from(code))) return candidate;
  }
  return null;
}
function hashRecovery(code) { return createHash('sha256').update(code).digest('hex'); }
function seal(payload, material) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', material.subarray(32), iv);
  cipher.setAAD(Buffer.from('auria/totp/v1'));
  const plaintext = Buffer.from(JSON.stringify(payload));
  try {
    const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') };
  } finally { plaintext.fill(0); }
}
function validEnvelope(value) {
  return value && /^[a-f0-9]{24}$/.test(value.iv) && /^[a-f0-9]{32}$/.test(value.tag) &&
    typeof value.data === 'string' && /^(?:[a-f0-9]{2}){1,2048}$/.test(value.data);
}
function unseal(envelope, material) {
  const decipher = createDecipheriv('aes-256-gcm', material.subarray(32), Buffer.from(envelope.iv, 'hex'));
  decipher.setAAD(Buffer.from('auria/totp/v1')); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'hex')), decipher.final()]);
  try {
    const payload = JSON.parse(plaintext.toString());
    if (!/^[a-f0-9]{40}$/.test(payload.secret) || !Number.isSafeInteger(payload.lastStep) || payload.lastStep < -1 ||
        !Array.isArray(payload.recovery) || payload.recovery.length > 10 || payload.recovery.some(x => !/^[a-f0-9]{64}$/.test(x))) throw new Error('Invalid TOTP payload');
    return payload;
  } finally { plaintext.fill(0); }
}
function consume(payload, code, time) {
  const secret = Buffer.from(payload.secret, 'hex');
  let step;
  try { step = matchStep(secret, code, time, payload.lastStep); } finally { secret.fill(0); }
  if (step !== null) { payload.lastStep = step; return true; }
  if (typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) return false;
  const hash = Buffer.from(hashRecovery(code), 'hex');
  const index = payload.recovery.findIndex(x => timingSafeEqual(Buffer.from(x, 'hex'), hash));
  if (index < 0) return false;
  payload.recovery.splice(index, 1); return true;
}
module.exports = { base32, token, matchStep, hashRecovery, seal, unseal, consume, validEnvelope };
