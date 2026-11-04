# Demo: the database is encrypted

Five minutes, on a Mac with Auria installed and a few contacts added.
It shows that the saved file can't be read by anything except the app, with the password.

**Before you start:** open the app, point out a contact name (for example "Marcus Hale"), then quit with Cmd+Q.

## Where the data lives

| Mac | Windows | Linux |
| --- | --- | --- |
| `~/Library/Application Support/Auria/` | `%APPDATA%\Auria\` | `~/.config/Auria/` |

Two files matter:
- `crm.db`: the encrypted database.
- `auth.json`: the password's random salt and a check value. It never holds the password or the key.

## 1. In a SQL browser (DB Browser for SQLite)

1. Download **DB Browser for SQLite** from [sqlitebrowser.org](https://sqlitebrowser.org/dl/). It's free.
2. **File → Open Database**, then press **Cmd+Shift+G** and paste `~/Library/Application Support/Auria/crm.db`.
3. It can't open the file. Depending on the version, it either says the file is not a database or asks for an encryption password, and no password opens it.

**Why no password opens it here:** the file is encrypted with **ChaCha20-Poly1305** (SQLite3 Multiple Ciphers). The key isn't the password typed into the app. It's a 256-bit key derived from that password with **scrypt** (a deliberately slow function), and it never leaves the app.

## 2. Side by side with a normal database (Terminal)

```bash
cd ~/Library/"Application Support"/"Auria"
sqlite3 /tmp/plain.db "create table people(name); insert into people values('Marcus Hale');"

head -c 32 /tmp/plain.db | xxd     # starts with "SQLite format 3"
head -c 32 crm.db | xxd            # random bytes, no header

strings /tmp/plain.db | grep Marcus   # prints: Marcus Hale
strings crm.db | grep Marcus          # prints nothing

sqlite3 crm.db ".tables"           # Error: file is not a database
rm /tmp/plain.db
```

Use a name that's actually in your copy of the app.

## 3. In the app

1. Open the app and type a wrong password. It shows **Incorrect password** and a countdown. Each wrong try doubles the wait, up to a minute, and the wait carries over a restart.
2. Type the right password. Everything is back.
3. Click **Lock** (or press Cmd+L). The data disappears from the screen and the database is closed.

## What to say

> The whole database file is encrypted on disk with ChaCha20-Poly1305: every table and index, not just some fields. The key is derived from the password with scrypt, and the password is never stored. Without it, the file is just noise, even to SQL tools. The app also locks itself after 15 minutes without use, or when the computer sleeps or its screen locks.

Built by Adrian (encrypted database, `database/`) and Nic (password and key, `auth/`). See [`SECURITY.md`](../SECURITY.md).
