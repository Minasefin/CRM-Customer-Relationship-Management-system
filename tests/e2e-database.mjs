// End-to-end check of the app running on the real encrypted database.
// Runs in GitHub Actions (.github/workflows/e2e.yml). It drives the actual Electron app
// the way a person would, then restarts it to prove changes were saved.
//
// Locally (needs the database module built for Electron, see README):
//   npm run build && npm i --no-save playwright-core@1.63.0 && node tests/e2e-database.mjs
//
// It uses a random throwaway key and a temporary folder, never your .dev-key or your data.
import { _electron as electron } from 'playwright-core';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const KEY = randomBytes(32).toString('hex');
const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'crm-e2e-'));
const results = [];

async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push(`FAIL  ${name}`);
    console.error(`FAIL  ${name}\n${err.stack || err}`);
    // Shows up as an annotation on the GitHub check, so the reason is visible without opening the log.
    if (process.env.GITHUB_ACTIONS) {
      const msg = String(err.message || err).split('\n').slice(0, 4).join(' | ').replace(/%/g, '%25');
      console.log(`::error title=${name}::${msg}`);
    }
    throw err;
  }
}

async function launch(key, extraEnv = {}) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, CRM_DEV_KEY: key, CRM_USER_DATA: DATA_DIR, VITE_DEV_SERVER_URL: '', ...extraEnv },
  });
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream.on('data', (d) => {
      const line = String(d).trim().split('\n')[0];
      if (/\[database\]|\[db:/.test(line) && process.env.GITHUB_ACTIONS) console.log(`::warning title=App log::${line}`);
    });
  }
  const page = await app.firstWindow();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.waitForSelector('.sidebar');
  // Calls the same functions the screens use, for checks the UI can't show directly.
  const call = (name, ...args) =>
    page.evaluate(([n, a]) => window.crm.api[n](...a), [name, args]);
  return { app, page, call };
}

const nav = (page, label) => page.locator('.nav, .sidebar-foot').getByRole('button', { name: new RegExp(`^${label}`) }).click();
const drawer = (page) => page.locator('.drawer');

let firstNoteAt;
let testId;

try {
  // ---------- First run: fresh database ----------
  let { app, page, call } = await launch(KEY);

  await step('opens the encrypted database and seeds the sample people', async () => {
    assert.equal(await page.evaluate(() => window.crm.dataMode), 'dev-database');
    await page.getByText('Saved on this computer').waitFor();
    const contacts = await call('getContacts');
    assert.equal(contacts.length, 13);
    const notes = contacts.flatMap((c) => c.notes);
    assert.ok(notes.length > 40, `expected seeded notes, got ${notes.length}`);
    // Seeded dates are back-dated, not all "today".
    assert.ok(notes.some((n) => Date.now() - new Date(n.at) > 30 * 864e5), 'notes keep their old dates');
    assert.equal((await call('getContracts')).length, 4);
  });

  await step('database errors reach the page as a short message, no internals', async () => {
    const msg = await page.evaluate(() =>
      window.crm.api.createOrganization({}).then(() => 'saved?!', (e) => e.message),
    );
    assert.notEqual(msg, 'saved?!');
    assert.ok(msg.length > 0 && msg.length < 200, msg);
    assert.ok(!/invoking remote method|\bat \w+ \(|sqlite|\.cjs/i.test(msg), `leaked detail: ${msg}`);
  });

  await step('the page cannot reach Node or the raw IPC', async () => {
    const exposed = await page.evaluate(() => ({
      require: typeof window.require,
      process: typeof window.process,
      ipc: typeof window.ipcRenderer,
      keys: Object.keys(window.crm.api).sort(),
    }));
    assert.equal(exposed.require, 'undefined');
    assert.equal(exposed.process, 'undefined');
    assert.equal(exposed.ipc, 'undefined');
    for (const k of exposed.keys) assert.ok(!/key|open|close|rekey/i.test(k), `lifecycle function exposed: ${k}`);
  });

  await step('add a contact', async () => {
    await nav(page, 'Contacts');
    await page.getByRole('button', { name: 'Add contact' }).first().click();
    const d = drawer(page);
    await d.getByLabel('First name').fill('Testa');
    await d.getByLabel('Last name').fill('Endtoend');
    await d.getByLabel('Organization').selectOption({ label: 'Ironclad Security Group' });
    await d.getByRole('button', { name: 'Add contact' }).click();
    await page.getByRole('heading', { name: 'Testa Endtoend' }).waitFor();
    testId = (await call('getContacts')).find((c) => c.lastName === 'Endtoend').id;
    assert.ok(testId);
  });

  await step('add a note, then edit it: text changes, date stays', async () => {
    await page.getByLabel('New note about Testa').fill('First call about the Erbil job.');
    await page.getByRole('button', { name: 'Save note' }).click();
    await page.locator('.timeline').getByText('First call about the Erbil job.').waitFor();
    firstNoteAt = (await call('getContact', testId)).notes[0].at;

    await page.waitForTimeout(1100); // so a changed date would be visible
    await page.locator('.timeline li').first().hover();
    await page.getByRole('button', { name: /^Edit note from/ }).first().click();
    const box = page.locator('.note-edit-form textarea');
    await box.fill('First call about the Erbil job. He is interested.');
    await page.locator('.note-edit-form').getByRole('button', { name: 'Save' }).click();
    await page.locator('.timeline').getByText('He is interested.').waitFor();

    const notes = (await call('getContact', testId)).notes;
    assert.equal(notes.length, 1);
    assert.equal(notes[0].at, firstNoteAt);
    assert.equal(notes[0].text, 'First call about the Erbil job. He is interested.');
  });

  await step('an empty note is refused with a message', async () => {
    const msg = await page.evaluate((id) => window.crm.api.addNote(id, '   ').then(() => 'saved?!', (e) => e.message), testId);
    assert.notEqual(msg, 'saved?!');
  });

  await step('move to another firm keeps work history', async () => {
    await page.locator('.quick-actions').getByRole('button', { name: 'Edit' }).click();
    const d = drawer(page);
    await d.getByLabel('Organization').selectOption({ label: 'Northwind Tactical' });
    await d.getByRole('button', { name: 'Save changes' }).click();
    await d.getByRole('button', { name: "Yes, they're moving" }).click();
    await d.waitFor({ state: 'detached' });
    const history = await call('getEmploymentHistory', testId);
    assert.equal(history.length, 2);
    assert.equal(history.filter((e) => e.end === null).length, 1);
    const current = history.find((e) => e.end === null);
    const orgs = await call('getOrganizations');
    assert.equal(orgs.find((o) => o.id === current.orgId).name, 'Northwind Tactical');
  });

  await step('contract with a blank value saves as unknown; contractor is locked on edit', async () => {
    await page.locator('.profile-side').getByRole('button', { name: 'Add contract' }).click();
    const d = drawer(page);
    await d.getByLabel('Contract name').fill('E2E convoy escort');
    await d.getByRole('button', { name: 'Add contract' }).click();
    await d.waitFor({ state: 'detached' });
    const k = (await call('getContracts')).find((x) => x.title === 'E2E convoy escort');
    assert.equal(k.value, null);
    assert.equal(k.archived, false);

    await page.getByRole('button', { name: 'Edit E2E convoy escort' }).click();
    assert.equal(await drawer(page).getByLabel('Contractor').isDisabled(), true);
    await drawer(page).getByRole('button', { name: 'Cancel' }).click();
    await drawer(page).waitFor({ state: 'detached' });
  });

  await step('archive a contract, find it in Archived, restore it', async () => {
    await nav(page, 'Contracts');
    await page.getByRole('button', { name: 'Actions for E2E convoy escort' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await page.getByRole('button', { name: 'Archive contract' }).click();
    await page.locator('.dialog').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Actions for E2E convoy escort' }).count(), 0);
    assert.equal((await call('getContracts')).find((x) => x.title === 'E2E convoy escort').archived, true);

    await nav(page, 'Archived');
    await page.getByRole('button', { name: 'Actions for E2E convoy escort' }).click();
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await page.waitForFunction(() => !document.body.innerText.includes('E2E convoy escort'));
    assert.equal((await call('getContracts')).find((x) => x.title === 'E2E convoy escort').archived, false);
  });

  await step('archive a firm and restore it', async () => {
    await nav(page, 'Organizations');
    await page.getByRole('button', { name: 'Actions for Harbor Line Services' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await page.locator('.dialog').getByRole('button', { name: 'Archive' }).click();
    await page.locator('.dialog').waitFor({ state: 'detached' });
    assert.equal((await call('getOrganizations')).find((o) => o.name === 'Harbor Line Services').archived, true);

    await nav(page, 'Archived');
    await page.getByRole('button', { name: 'Actions for Harbor Line Services' }).click();
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await page.waitForFunction(async () =>
      !(await window.crm.api.getOrganizations()).find((o) => o.name === 'Harbor Line Services').archived,
    );
  });

  await step('mark a person left / inactive', async () => {
    await nav(page, 'Contacts');
    await page.getByPlaceholder('Search by name').fill('Endtoend');
    await page.getByRole('button', { name: 'Open Testa Endtoend' }).click();
    await page.getByRole('button', { name: 'Mark left / inactive' }).click();
    await page.getByRole('button', { name: 'Yes, mark left / inactive' }).click();
    await page.locator('.status-pill', { hasText: 'Left / inactive' }).waitFor();
    assert.equal((await call('getContact', testId)).status, 'inactive');
  });

  await step('search "Markus Hail" finds Marcus Hale (sounds-like)', async () => {
    await page.getByRole('button', { name: /Back/ }).click();
    await nav(page, 'Contacts');
    await page.getByPlaceholder('Search by name').fill('Markus Hail');
    await page.getByRole('button', { name: 'Open Marcus Hale' }).waitFor();
  });

  await app.close();

  // ---------- Second run: same key, everything is still there ----------
  ({ app, page, call } = await launch(KEY));

  await step('after restart, changes were saved and nothing was seeded twice', async () => {
    const contacts = await call('getContacts');
    assert.equal(contacts.length, 14);
    const t = contacts.find((c) => c.id === testId);
    assert.equal(t.status, 'inactive');
    assert.equal(t.notes[0].at, firstNoteAt);
    assert.equal(t.notes[0].text, 'First call about the Erbil job. He is interested.');
    assert.equal((await call('getOrganizations')).length, 5);
    assert.ok((await call('getContracts')).some((k) => k.title === 'E2E convoy escort' && k.value === null));
  });

  await app.close();

  // ---------- Third run: wrong key ----------
  ({ app, page } = await launch(randomBytes(32).toString('hex')));

  await step('a wrong key does not open the data and says so', async () => {
    await page.getByText("The test database didn't open.").waitFor();
    assert.equal(await page.evaluate(() => window.crm.dataMode), 'sample');
    // Auth keeps the API exposed while locked; data access must still fail.
    assert.equal(await page.evaluate(() => typeof window.crm.api.login), 'function');
    assert.equal(await page.evaluate(() => typeof window.crm.api.getContacts), 'function');
    await assert.rejects(() => page.evaluate(() => window.crm.api.getContacts()));
    await page.getByText('Sample data, not saved').waitFor();
  });

  await app.close();

  // ---------- Fourth run: no key at all ----------
  ({ app, page } = await launch(''));

  await step('without a key the app runs on sample data, no warning', async () => {
    assert.equal(await page.evaluate(() => window.crm.dataMode), 'sample');
    assert.equal(await page.getByText("The test database didn't open.").count(), 0);
  });

  await app.close();
} finally {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
}
