-- Version 5: a file can belong to a person who isn't with a firm. org_id becomes optional;
-- every file still belongs to a firm, a person, or both. SQLite can't relax NOT NULL in place,
-- so the table is rebuilt and the rows copied (secure_delete is on: old pages are zeroed).
CREATE TABLE organization_attachments_v5 (
 id TEXT PRIMARY KEY NOT NULL,
 org_id TEXT REFERENCES organizations(id),
 name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 10485760),
 data BLOB NOT NULL CHECK(length(data)=size),
 created_at TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 contact_id TEXT REFERENCES contacts(id),
 contract_id TEXT REFERENCES contracts(id),
 CHECK(org_id IS NOT NULL OR contact_id IS NOT NULL)
) STRICT;
INSERT INTO organization_attachments_v5 (id,org_id,name,mime_type,size,data,created_at,archived,contact_id,contract_id)
  SELECT id,org_id,name,mime_type,size,data,created_at,archived,contact_id,contract_id FROM organization_attachments;
DROP TABLE organization_attachments;
ALTER TABLE organization_attachments_v5 RENAME TO organization_attachments;
CREATE INDEX attachments_org ON organization_attachments(org_id,created_at);
CREATE INDEX attachments_contact ON organization_attachments(contact_id);
PRAGMA user_version=5;
