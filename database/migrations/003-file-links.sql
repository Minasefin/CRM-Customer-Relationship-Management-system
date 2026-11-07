-- Version 3: a firm's file can be about one person and/or one of the firm's contracts.
ALTER TABLE organization_attachments ADD COLUMN contact_id TEXT REFERENCES contacts(id);
ALTER TABLE organization_attachments ADD COLUMN contract_id TEXT REFERENCES contracts(id);
CREATE INDEX attachments_contact ON organization_attachments(contact_id);
PRAGMA user_version=3;
