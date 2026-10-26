-- Draft schema. Matches src/api/mockData.js and docs/API.md.
-- Nothing is deleted: contacts are archived through `status`.

CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  city       TEXT,
  country    TEXT,
  logo       BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contacts (
  id         TEXT PRIMARY KEY,
  org_id     TEXT REFERENCES organizations(id),   -- current organization
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  title      TEXT,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deceased')),
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  spouse     TEXT,
  photo      BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE children (
  id         TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  name       TEXT NOT NULL
);

CREATE TABLE skills (
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  skill      TEXT NOT NULL,
  PRIMARY KEY (contact_id, skill)
);

CREATE TABLE social_accounts (
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  platform   TEXT NOT NULL,   -- 'x', 'instagram', 'snapchat', 'facebook'
  handle     TEXT NOT NULL,
  PRIMARY KEY (contact_id, platform)
);

CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  text       TEXT NOT NULL
);

-- One row per stint at an organization; end_date NULL = current job.
CREATE TABLE employment_history (
  id         TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  org_id     TEXT NOT NULL REFERENCES organizations(id),
  start_date TEXT NOT NULL,
  end_date   TEXT
);

CREATE TABLE contracts (
  id         TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  org_id     TEXT REFERENCES organizations(id),
  title      TEXT NOT NULL,
  location   TEXT,
  value      INTEGER,          -- whole US dollars
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  start_date TEXT,
  end_date   TEXT
);

CREATE INDEX idx_notes_contact_at ON notes (contact_id, at);
CREATE INDEX idx_skills_skill ON skills (skill);
