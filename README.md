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

## Add or edit a person — the easy way

```bash
npm run edit
```

Opens the **editor** at http://localhost:8790 — pick a teammate, edit their
fields in the form, upload their headshot / card art, design the QR code
(colors, dot styles, Vista V center logo), all with a live phone preview.
Every save rebuilds `docs/` automatically. When you're happy, publish:

```bash
git add -A; git commit -m "update cards"; git push
```

The live site updates a minute or two after the push.

## Add or edit a person — the manual way

1. Copy `people/william-floyd.json`, rename it to the new person's slug
   (e.g. `julie-miller.json`), and fill in their info.
2. Drop their headshot at `assets/photos/<slug>.jpg` (used on the page and
   embedded inside the vCard so it saves to the phone's contact too).
   Optional: printed card designs at `assets/cardart/<slug>-front.png` /
   `<slug>-back.png`.
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

## Where it lives

- **Live site:** https://mrwhfloydiv.github.io/vista-business-cards/
- **Repo:** https://github.com/mrwhfloydiv/vista-business-cards
  (GitHub Pages serves the `docs/` folder on `master`)

Moving to a custom domain later (e.g. `card.vistasiteselection.com`): point
DNS at GitHub Pages, set the custom domain in repo Settings → Pages, change
`baseUrl` in `site.json`, rebuild, push — and reprint QRs, since the old ones
encode the github.io URL.

⚠️ **The QR in the ink is forever** — that's the whole lesson from QR Code
Chimp. Never print a card until `baseUrl` matches where the site actually
lives, and scan-test a printed-size QR first.

## Scan tracking

Two hooks are built into every card page, both configured in `site.json`:

- `"goatcounter": "<code>"` — sign up free at goatcounter.com, pick a code
  (e.g. `vistacards` → `vistacards.goatcounter.com`), put the code here,
  rebuild, push. Every card page view is then logged per-path
  (`/william-floyd/` = William's scans) with referrer, device, and country —
  and GoatCounter has an API the Command Station can query later.
- `"analyticsEndpoint": "<url>"` — when the Command Station has its own
  endpoint, put the URL here; pages then also send a beacon with the card
  slug, timestamp, referrer, and user agent.

## Not built yet (planned)

- Lead capture ("exchange info" form) → feeds the Command Station. Needs a
  server or form endpoint; GitHub Pages alone can't receive submissions.
