'use strict';
// Files linked to a person and/or a contract (database version 3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const SQLite = require('better-sqlite3-multiple-ciphers');
const { createDatabase } = require('./index.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'crm.db');
}
const txt = (name, body = 'Synthetic file') => ({ name, mimeType: 'text/plain', dataBase64: Buffer.from(body).toString('base64') });

test('a version 2 database with files upgrades to the current version and keeps them (links start empty)', async (t) => {
  const file = fixture(t), key = randomBytes(32);
  const old = new SQLite(file); old.key(key);
  old.exec(fs.readFileSync(path.join(__dirname, 'migrations', '001-original.sql'), 'utf8'));
  old.exec(fs.readFileSync(path.join(__dirname, 'migrations', '002-names-attachments.sql'), 'utf8'));
  const at = new Date().toISOString();
  old.prepare('INSERT INTO organizations VALUES (?,?,?,?,?,?,?)').run('o', 'Synthetic v2 firm', '', '', null, 0, at);
  old.prepare('INSERT INTO organization_attachments (id,org_id,name,mime_type,size,data,created_at,archived) VALUES (?,?,?,?,?,?,?,0)')
    .run('a', 'o', 'old.txt', 'text/plain', 3, Buffer.from('old'), at);
  assert.equal(old.pragma('user_version', { simple: true }), 2);
  old.close();

  const db = createDatabase(file); t.after(() => db.closeDatabase());
  db.openDatabase(key);
  const [a] = await db.getOrganizationAttachments('o');
  assert.equal(a.name, 'old.txt');
  assert.equal(a.contactId, null);
  assert.equal(a.contractId, null);
  assert.equal(Buffer.from((await db.getOrganizationAttachment('a')).dataBase64, 'base64').toString(), 'old');
  db.closeDatabase();
  const raw = new SQLite(file); raw.key(key);
  assert.equal(raw.pragma('user_version', { simple: true }), 4);
  raw.close();
});

test('files link to a person and to a contract of the same firm; links change, clear and persist', async (t) => {
  const file = fixture(t), key = randomBytes(32);
  const db = createDatabase(file); t.after(() => db.closeDatabase());
  db.openDatabase(key);
  const org = await db.createOrganization({ name: 'Synthetic firm' });
  const other = await db.createOrganization({ name: 'Synthetic other firm' });
  const person = await db.createContact({ firstName: 'Synthetic', lastName: 'Person', orgId: org.id });
  const elsewhere = await db.createContact({ firstName: 'Synthetic', lastName: 'Elsewhere', orgId: other.id });
  const contract = await db.createContract({ contactId: person.id, title: 'Synthetic contract' });
  const otherContract = await db.createContract({ contactId: elsewhere.id, title: 'Other contract' });

  const firmWide = await db.addOrganizationAttachment(org.id, txt('firm.txt'));
  assert.equal(firmWide.contactId, null);
  const aboutPerson = await db.addOrganizationAttachment(org.id, { ...txt('passport.txt'), contactId: person.id });
  assert.equal(aboutPerson.contactId, person.id);
  const aboutBoth = await db.addOrganizationAttachment(org.id, { ...txt('contract.txt'), contactId: person.id, contractId: contract.id });
  assert.equal(aboutBoth.contractId, contract.id);

  // Refused: another firm's contract, a missing person, a missing file.
  await assert.rejects(db.addOrganizationAttachment(org.id, { ...txt('x.txt'), contractId: otherContract.id }), /another organization/);
  await assert.rejects(db.addOrganizationAttachment(org.id, { ...txt('x.txt'), contactId: 'missing' }));
  await assert.rejects(db.linkOrganizationAttachment(firmWide.id, { contractId: otherContract.id }), /another organization/);
  await assert.rejects(db.linkOrganizationAttachment('missing', { contactId: person.id }));

  assert.deepEqual((await db.getContactAttachments(person.id)).map((a) => a.name), ['passport.txt', 'contract.txt']);
  assert.deepEqual(await db.getContactAttachments(elsewhere.id), []);
  await assert.rejects(db.getContactAttachments('missing'));

  // Change and clear links; the bytes never come back in metadata.
  const moved = await db.linkOrganizationAttachment(firmWide.id, { contactId: person.id });
  assert.equal(moved.contactId, person.id);
  assert.equal(moved.data, undefined);
  await db.linkOrganizationAttachment(aboutPerson.id, {});
  db.closeDatabase();
  db.openDatabase(key);
  const after = Object.fromEntries((await db.getOrganizationAttachments(org.id)).map((a) => [a.name, a]));
  assert.equal(after['firm.txt'].contactId, person.id);
  assert.equal(after['passport.txt'].contactId, null);
  assert.equal(after['contract.txt'].contractId, contract.id);
});
