// Fills an EMPTY development database with the same synthetic people, firms and
// contracts the app shows in sample mode (src/api/mockData.js), so testing starts
// with realistic history instead of a blank screen. Never runs in an installed app.
//
// Records are created through the database's own functions (so they're validated),
// then a second connection back-dates history: note times, start dates, work history.
// Those dates can't be set through the normal functions on purpose.
const path = require('path');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');

async function seedIfEmpty(db, file, key) {
  if ((await db.getOrganizations()).length > 0) return false;

  const mock = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'api', 'mockData.js')).href);
  const orgIds = {};
  const contactIds = {};

  for (const o of mock.organizations) {
    const created = await db.createOrganization({ name: o.name, city: o.city || '', country: o.country || '', logo: null });
    orgIds[o.id] = created.id;
  }

  for (const c of mock.contacts) {
    const created = await db.createContact({
      firstName: c.firstName,
      lastName: c.lastName,
      title: c.title || '',
      orgId: c.orgId ? orgIds[c.orgId] : null,
      photo: null,
      phones: c.phones || [],
      emails: c.emails || [],
      address: c.address || '',
      spouse: c.spouse || '',
      children: c.children || [],
      skills: c.skills || [],
      social: c.social || {},
    });
    contactIds[c.id] = created.id;
  }

  for (const k of mock.contracts) {
    const contract = await db.createContract({
      contactId: contactIds[k.contactId],
      title: k.title,
      location: k.location || '',
      value: k.value ?? null,
      status: k.status,
      start: k.start,
      end: k.end,
      notes: k.notes || '',
    });
    k.newId = contract.id;
  }

  // Back-date history with a second connection to the same encrypted file.
  const SQLite = require('better-sqlite3-multiple-ciphers');
  const raw = new SQLite(file);
  try {
    raw.key(key);
    raw.pragma('foreign_keys=ON');
    raw.transaction(() => {
      for (const o of mock.organizations) {
        raw.prepare('UPDATE organizations SET created_at=? WHERE id=?').run(o.createdAt, orgIds[o.id]);
      }
      for (const c of mock.contacts) {
        const id = contactIds[c.id];
        raw.prepare('UPDATE contacts SET created_at=?, status=? WHERE id=?').run(c.createdAt, c.status, id);
        const addNote = raw.prepare('INSERT INTO notes (id, contact_id, at, text) VALUES (?, ?, ?, ?)');
        for (const n of c.notes) addNote.run(randomUUID(), id, n.at, n.text);
        raw.prepare('DELETE FROM employment_history WHERE contact_id=?').run(id);
        const addJob = raw.prepare(
          'INSERT INTO employment_history (id, contact_id, org_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
        );
        for (const e of mock.employment.filter((x) => x.contactId === c.id)) {
          addJob.run(randomUUID(), id, orgIds[e.orgId], e.start, e.end);
        }
      }
    })();
  } finally {
    raw.close();
  }
  console.log(`[database] new development database filled with ${mock.contacts.length} sample contacts`);
  return true;
}

module.exports = { seedIfEmpty };
