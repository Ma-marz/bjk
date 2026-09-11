# BjK

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
