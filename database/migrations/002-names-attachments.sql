ALTER TABLE contacts ADD COLUMN middle_name TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN prefix TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN suffix TEXT NOT NULL DEFAULT '';
CREATE TABLE organization_attachments (
 id TEXT PRIMARY KEY NOT NULL,
 org_id TEXT NOT NULL REFERENCES organizations(id),
 name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 10485760),
 data BLOB NOT NULL CHECK(length(data)=size),
 created_at TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1))
) STRICT;
CREATE INDEX attachments_org ON organization_attachments(org_id,created_at);
PRAGMA user_version=2;
