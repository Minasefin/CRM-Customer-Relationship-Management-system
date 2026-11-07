-- Version 4: settings the app must be able to trust, kept inside the encrypted database.
-- second_factor = '1' means every sign-in needs an authenticator or recovery code. Stored
-- here (not only in auth.json) so editing or swapping auth.json can't switch 2FA off.
CREATE TABLE app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT;
PRAGMA user_version=4;
