// End-to-end check of the password screens in the real app (real encrypted database).
// Runs in GitHub Actions (.github/workflows/e2e.yml) after `npm run build`.
// Uses a temporary folder and made-up passwords; never your data.
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DIR = mkdtempSync(path.join(tmpdir(), 'crm-login-e2e-'));
const PW = 'maple ladder orbit canoe river';
const PW2 = 'quiet harbor lantern seven fig';
let failed = 0;

async function launch() {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, CRM_USER_DATA: DIR, CRM_DEV_KEY: '', VITE_DEV_SERVER_URL: '' },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  return { app, page };
}

async function s(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n${err.stack || err}`);
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error title=${name}::${String(err.message || err).split('\n').slice(0, 3).join(' | ')}`);
    }
  }
}

let app, page;
try {
  ({ app, page } = await launch());
  await s('setup screen shown', () => page.getByRole('heading', { name: 'Create your password' }).waitFor());
  await s('too short refused', async () => {
    await page.getByLabel('Password', { exact: true }).fill('short pass');
    await page.getByLabel('Type it again', { exact: true }).fill('short pass');
    await page.getByRole('button', { name: 'Create password and open' }).click();
    await page.getByText('Use at least 15 characters').waitFor();
  });
  await s('a common password is refused', async () => {
    await page.getByLabel('Password', { exact: true }).fill('passwordpassword');
    await page.getByLabel('Type it again', { exact: true }).fill('passwordpassword');
    await page.getByRole('button', { name: 'Create password and open' }).click();
    await page.getByText(/common, compromised/).waitFor();
  });
  await s('show password toggle', async () => {
    await page.getByRole('button', { name: 'Show password' }).click();
    if (await page.locator('#new-password').getAttribute('type') !== 'text') throw new Error('not shown');
  });
  await s('create password opens app', async () => {
    await page.getByLabel('Password', { exact: true }).fill(PW);
    await page.getByLabel('Type it again', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Create password and open' }).click();
    await page.getByText('Saved on this computer').waitFor();
  });
  await s('empty app, add an org', async () => {
    await page.locator('.nav').getByRole('button', { name: /^Organizations/ }).click();
    await page.getByRole('button', { name: /Add organization/ }).first().click();
    await page.locator('.drawer').getByLabel(/Organization name/).fill('Synthetic Test Firm');
    await page.locator('.drawer').getByRole('button', { name: 'Add organization' }).click();
    await page.getByText('Synthetic Test Firm').first().waitFor();
  });
  await s('Lock button shows the locked screen and hides the data', async () => {
    await page.locator('.sidebar').getByRole('button', { name: 'Lock' }).click();
    await page.getByRole('heading', { name: 'Locked' }).waitFor();
    if (await page.getByText('Synthetic Test Firm').count()) throw new Error('data still on screen');
  });
  await s('a wrong password shows a message and a wait', async () => {
    await page.getByLabel('Password', { exact: true }).fill('not the right password here');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByText('Incorrect password.').waitFor();
    await page.getByRole('button', { name: /Try again in/ }).waitFor();
  });
  await s('right password unlocks', async () => {
    await page.getByRole('button', { name: 'Unlock' }).waitFor({ timeout: 8000 });
    await page.getByLabel('Password', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByText('Saved on this computer').waitFor();
  });
  await s('change password in settings', async () => {
    await page.locator('.sidebar-foot').getByRole('button', { name: /^Settings/ }).click();
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByLabel('Current password', { exact: true }).fill(PW);
    await page.getByLabel('New password', { exact: true }).fill(PW2);
    await page.getByLabel('Type the new one again', { exact: true }).fill(PW2);
    await page.locator('form.change-password').getByRole('button', { name: 'Change password' }).click();
    await page.getByText('Password changed.').waitFor();
  });
  await app.close();
  ({ app, page } = await launch());
  await s('after restart: new password works and data is kept', async () => {
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    await page.getByLabel('Password', { exact: true }).fill(PW2);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByText('Saved on this computer').waitFor();
    await page.locator('.nav').getByRole('button', { name: /^Organizations/ }).click();
    await page.getByText('Synthetic Test Firm').first().waitFor();
  });
  await s('look around with sample data, then back to sign in', async () => {
    await page.locator('.sidebar').getByRole('button', { name: 'Lock' }).click();
    await page.getByRole('heading', { name: 'Locked' }).waitFor();
    await page.getByRole('button', { name: /sample data instead/ }).click();
    await page.getByText("You're looking at sample data.").waitFor();
    await page.getByText('Who to call').waitFor();
    await page.getByRole('button', { name: 'Sign in to your data' }).click();
    await page.getByRole('heading', { name: 'Locked' }).waitFor();
  });
  await app.close();
  await app.close();
} finally {
  rmSync(DIR, { recursive: true, force: true });
}
if (failed) {
  console.error(`${failed} step(s) failed`);
  process.exit(1);
}
console.log('All login steps passed');
