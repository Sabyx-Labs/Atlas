# Sabyx Atlas — Your information, mapped.
A local-first visual information mapping PWA by Sabyx Labs. Built by Sabyasachi Mondal. Plain HTML, CSS and JavaScript; no backend, no tracking.

## Files (single folder, no subfolders)
index.html, style.css, app.js, manifest.json, service-worker.js, icon-192.png, icon-512.png, README.md

## Run / deploy
- Local test: `python -m http.server` in this folder, open http://localhost:8000 (service workers need http://localhost or HTTPS).
- GitHub Pages: upload all files to a repo root, enable Pages. It is served over HTTPS, so the install prompt works.

## Install (Add to Home screen)
- Android / Chrome / Edge: use the install icon in the top bar, or the browser menu → Install app / Add to Home screen.
- iPhone / iPad (Safari): Share → Add to Home Screen.
After the first load the app works fully offline.

## Data
Everything is stored in IndexedDB on this device: nodes, relationships, settings and uploaded documents.
Backup JSON includes documents (base64), so backups of many large files can be big. Each document is limited to 25 MB.
CSV: nodes `ID,Name,Type,Description,Tags,Date,CreatedAt,UpdatedAt` plus type fields (Phone, Email, Address…); relationships `From,Relationship,To`.
Update the app: change files, then bump `CACHE` in service-worker.js.
