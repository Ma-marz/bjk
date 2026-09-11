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
