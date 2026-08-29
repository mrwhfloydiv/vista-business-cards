# Vista Site Selection — Digital Business Cards

Self-hosted replacement for QR Code Chimp. Each person gets an interactive
contact card page, a downloadable vCard (Save to Contacts), and a print-ready
QR code — all generated from one small JSON file per person. No subscriptions,
no card limits, no vendor holding the cards hostage.

## How it works

```
people/<slug>.json        →  you edit these (one per person)
assets/photos/<slug>.jpg  →  drop headshots here (jpg/jpeg/png, square-ish)
site.json                 →  company-wide settings (colors, domain, logo)
templates/card.html       →  the card page design
build.js                  →  the generator
docs/                     →  OUTPUT — deploy this folder anywhere static
```

## Add or edit a person

1. Copy `people/william-floyd.json`, rename it to the new person's slug
   (e.g. `julie-miller.json`), and fill in their info.
2. Drop their headshot at `assets/photos/<slug>.jpg` (used on the page and
   embedded inside the vCard so it saves to the phone's contact too).
3. Run the build:

```bash
npm run build
```

Each card lands in `docs/<slug>/` with:
- `index.html` — the card page
- `contact.vcf` — the Save to Contacts file
- `qr.svg` / `qr-print.png` — QR codes pointing at `baseUrl/<slug>/`
  (`qr-print.png` is 1200px, error-correction H — safe for print)

`docs/index.html` is a roster page listing everyone.

## Preview locally

```bash
python -m http.server 8765 --directory docs
```

Then open http://localhost:8765 — on your phone too if it's on the same
Wi-Fi (use this computer's LAN IP).

## Deploy

The `docs/` folder is pure static files. Options:

- **GitHub Pages** (like the Vista compression tool): push this repo, then in
  repo Settings → Pages choose "Deploy from a branch" → `main` → `/docs`.
- **Any server**: copy `docs/` to the web root. Done.

⚠️ **Before printing new cards:** set `baseUrl` in `site.json` to the real
final URL and re-run `npm run build` so the QR codes point at the right place.
The QR in the ink is forever — that's the whole lesson from QR Code Chimp.

## Not built yet (planned)

- Scan analytics + lead-capture ("exchange info") → feeds the Command Station.
  Requires the server-hosted step; GitHub Pages alone can't log scans
  server-side.
