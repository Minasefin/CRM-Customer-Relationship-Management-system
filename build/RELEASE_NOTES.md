## What's new in 0.2.0

**A new name: Auria.** "Your Network. Secured." New eagle-and-shield logo on the app, the sign-in screen and the icon.

**Two-step sign-in (2FA)**
- Turn it on in **Settings → Security**: scan a QR code with Microsoft or Google Authenticator, then sign in with your password **and** a 6-digit code.
- 10 one-time **recovery codes** in case you lose your phone (shown once, with Copy).
- The setting is also kept inside the encrypted database, so editing files on disk can't switch it off.

**Forgot your password? Recovery key**
- Make a **recovery key** in **Settings → Security** (shown once, with Copy). If you forget your password, choose **Forgot your password?** on the sign-in screen and use it to set a new one. You get a new recovery key each time.
- A recovery key doesn't get around two-step sign-in: the 6-digit code is still needed.
- Without a recovery key, nobody can reset the password. Not even us.

**Files**
- Attach files to a firm, a person or a contract: PDF, Word, Excel, PowerPoint, images, TXT and CSV, up to 10 MB each. They're stored **inside the encrypted database**.
- **Drop a file** into the Add file pop-up, or choose one from Finder / File Explorer.
- Add files while **adding or editing a contact or a contract**.
- Each file says who or what it's about. A person's profile lists every file about them, including people who aren't with a firm.
- Images and text files open inside the app. For anything else, **Save a copy…** (the app warns that the copy isn't encrypted).

**Contacts**
- Prefix, middle name and suffix ("Dr. Marcus James Hale III"). Search finds middle names too.
- Notes show **bold**, *italic* and bullet lists as you type.

**Your data**
- **Settings → Your data** shows where your data is saved. **Move…** puts it in another folder, for example on a USB drive.

**Easier to use**
- Add and edit forms open as centered pop-ups. Closing one with unsaved changes asks: Save changes, Discard changes, or Keep editing.
- In a form, **Enter** confirms a field; **Enter again** saves (Cmd/Ctrl+Enter saves straight away).
- **Customize Home:** drag cards, hide them, add them back, or reset the layout.
- The sidebar folds away (Cmd/Ctrl+B). **Lock** sits above Settings (Cmd/Ctrl+L).
- Fixed: the ⋯ menu was cut off at the bottom of tables, so Archive couldn't be reached.

## Updating from 0.1

Install over your current copy. Your contacts and password carry over: the app moves your data from the old "Contractor CRM" folder to "Auria" the first time it opens, and upgrades it when you sign in. After that, version 0.1 can't open the upgraded data, so keep using 0.2.

## Download

| Your computer | Download |
| --- | --- |
| **Mac** (Apple Silicon or Intel) | `Auria-…-mac.dmg` |
| **Windows** | `Auria-…-windows-setup.exe` |
| **Linux** | `Auria-…-linux.AppImage` |

## Opening it the first time

Your computer will block the app once, because it isn't from the App Store or Microsoft Store. That's expected, and you only do this once. Full steps with a one-click button are in **Read Me First** (inside the Mac installer, and attached below).

**Mac**
1. Open the `.dmg` and drag **Auria** into **Applications**.
2. Open it from Applications. When your Mac says it can't verify the app, click **Done** (not Move to Trash).
3. Go to **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway**. Enter your password and click **Open Anyway** again.

**Windows**
1. Run the Setup file.
2. If you see "Windows protected your PC", click **More info → Run anyway**.

**Linux:** make the AppImage executable (`chmod +x`), then open it.

## First launch

The app asks you to **create a password** (at least 15 characters; a few random words works well). Everything you save is encrypted on your computer with it, and you'll enter it each time you open the app. **There is no password reset**, so keep it somewhere safe.

The app locks itself after 15 minutes without use, and when your computer sleeps or its screen locks. To look around first, choose **Look around with sample data** (nothing is saved).

Auria works completely offline. Everything you enter stays on your computer.
