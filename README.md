# BjK

Generate new prayer PDFs with the [prayer generator](tools/prayer-generator/README.md).
Edit its `config.json` for the week and names, and `sample.txt` for the PDF layout.

Prayer PDFs are rendered directly in the browser; no image-generation step is needed.
Keep PDFs in `prayer/<name>/Nädal <number>.pdf` and choose a sheet from the dropdown.

For the full-page preview without PDF viewer controls, serve the project over HTTP:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Direct `file://` opening falls back to the browser's
native PDF viewer, because browsers block local PDF fetches and module imports.
The button below the document opens the original PDF in a new tab in both modes.

Login sessions are independent per browser/device and last 30 days. The browser
stores its token locally; the `Sessions` sheet lets the backend check who owns
that token and whether it is still valid without receiving the password again.
Logging out removes only that token. Changing a password revokes other sessions
while preserving the session making the change.

Backend changes must also be published in Google Apps Script: copy
`google-sheet-backend.gs` into the existing script project, then use Deploy →
Manage deployments → Edit → New version → Deploy. Update the existing deployment
to keep the endpoint URL unchanged. Pushing this file to GitHub alone does not
update the running backend. Existing valid session rows can stay; devices whose
tokens were revoked by the old login behavior need to log in again.

Chat unread state is saved per user and conversation in `ChatReads`
(`id`, `userId`, `peerId`, `lastReadAt`). The sheet is created automatically by
`initDatabase()` or the first inbox/read request after deploying the updated
Apps Script. Existing messages are preserved and initially count as unread until
their conversation is opened. Read checkpoints only advance through incoming
messages displayed in an open conversation, and sync across devices. The portal
checks for new messages every 5 seconds while a conversation is open, and every
15 seconds elsewhere while the browser tab is visible. Switching conversations
triggers an immediate refresh.

The site loads its Apps Script URL from `google_sheet_endpoint` in
`tools/prayer-generator/config.json`, alongside the prayer generation parameters.
Change that value when switching deployments and reload the portal.

Directly opening `index.html` uses a generated endpoint embedded in the page,
because browsers block fetching local JSON files. After changing
`google_sheet_endpoint` in `tools/prayer-generator/config.json`, run:

```sh
python3 tools/prayer-generator/sync_config.py
```

Normal prayer generation also syncs this fallback automatically. Over HTTP,
the portal reads the JSON configuration directly.
