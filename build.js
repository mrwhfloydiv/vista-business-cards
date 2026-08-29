/**
 * Vista Site Selection — digital business card builder.
 *
 * Reads site.json + people/*.json and generates, for each person:
 *   docs/<slug>/index.html   — the interactive contact card page
 *   docs/<slug>/contact.vcf  — vCard (with embedded photo when available)
 *   docs/<slug>/qr.svg       — QR code pointing at the card URL (web/preview)
 *   docs/<slug>/qr-print.png — high-res QR for print (1200px)
 * Plus docs/index.html — the team dashboard with live card previews —
 * and docs/assets/ with shared brand assets.
 *
 * Optional inputs per person:
 *   assets/photos/<slug>.jpg|.jpeg|.png          — headshot
 *   assets/cardart/<slug>-front.(png|jpg|jpeg)   — printed card design, front
 *   assets/cardart/<slug>-back.(png|jpg|jpeg)    — printed card design, back
 *
 * Usage: node build.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const QRCode = require('qrcode');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'docs');
const PHOTO_DIR = path.join(ROOT, 'assets', 'photos');
const CARDART_DIR = path.join(ROOT, 'assets', 'cardart');
const IMG_EXTS = ['.jpg', '.jpeg', '.png'];
const SHARED_ASSETS = ['vista-v.png', 'vista-v-white.png', 'vista-logo-full.png', 'grid-bg.js'];

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const template = fs.readFileSync(path.join(ROOT, 'templates', 'card.html'), 'utf8');

const ICONS = {
  phone: '<svg viewBox="0 0 24 24"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.25 1.02z"/></svg>',
  sms: '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM8 11H6V9h2zm5 0h-2V9h2zm5 0h-2V9h2z"/></svg>',
  email: '<svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82A14.1 14.1 0 0 1 12 4.04zM4.26 14a8.1 8.1 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4zm.81 2h2.95c.32 1.25.78 2.45 1.38 3.56A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07a8.03 8.03 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.02 8zM12 19.96a14.1 14.1 0 0 1-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.6 14.6 0 0 1 0-4h4.68a14.6 14.6 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.1 8.1 0 0 1 0 4z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V9.75H5.67v8.59h2.67zM7 8.48a1.56 1.56 0 1 0 0-3.12 1.56 1.56 0 0 0 0 3.12zm11.34 9.86v-4.93c0-2.64-1.41-3.87-3.29-3.87a2.84 2.84 0 0 0-2.58 1.42V9.75h-2.67v8.59h2.67v-4.8c0-1.13.51-1.86 1.53-1.86s1.51.73 1.51 1.86v4.8h2.83z"/></svg>'
};

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function telHref(num) {
  const digits = String(num).replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : '+1' + digits.replace(/^1/, '');
}

function findImage(dir, base) {
  for (const ext of IMG_EXTS) {
    const p = path.join(dir, base + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function initials(person) {
  const first = (person.firstName || '').trim()[0] || '';
  const last = (person.lastName || '').trim()[0] || '';
  return (first + last).toUpperCase() || '?';
}

// ---------- vCard ----------
function vEsc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Fold lines at 75 octets per RFC 2426 (continuation lines start with a space).
function foldLine(line) {
  if (line.length <= 75) return line;
  if (/^[\x00-\x7F]*$/.test(line)) {
    // ASCII fast path (this is the multi-MB base64 PHOTO line) — chunk by index,
    // never re-slice the whole remainder.
    const parts = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
    return parts.join('\r\n');
  }
  // Non-ASCII lines (names etc.) are short — byte-accurate walk is fine here.
  const out = [];
  let rest = line;
  let max = 75;
  while (Buffer.byteLength(rest, 'utf8') > max) {
    let cut = max;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > max) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
    max = 74;
  }
  out.push(rest);
  return out.join('\r\n');
}

// Resize an image via Pillow (if python is available). Returns true on success.
const PY_RESIZE = [
  'import sys',
  'from PIL import Image, ImageOps',
  'src, dest, size, q = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])',
  "im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')",
  'im.thumbnail((size, size))',
  "im.save(dest, 'JPEG', quality=q)"
].join('\n');

function resizeImage(src, dest, size, quality) {
  try {
    execFileSync('python', ['-c', PY_RESIZE, src, dest, String(size), String(quality)], { stdio: 'pipe' });
    return fs.existsSync(dest);
  } catch (e) {
    return false;
  }
}

function buildVcf(person, photoPath) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${vEsc(person.lastName)};${vEsc(person.firstName)};;;`,
    `FN:${vEsc(person.displayName)}`,
    `ORG:${vEsc(person.company || site.company)}`,
    `TITLE:${vEsc(person.title)}`
  ];
  if (person.mobile) lines.push(`TEL;TYPE=CELL,VOICE:${telHref(person.mobile)}`);
  if (person.workPhone) lines.push(`TEL;TYPE=WORK,VOICE:${telHref(person.workPhone)}`);
  if (person.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${vEsc(person.email)}`);
  (person.links || []).forEach((l, i) => {
    lines.push(`item${i + 1}.URL:${vEsc(l.url)}`);
    lines.push(`item${i + 1}.X-ABLabel:${vEsc(l.label)}`);
  });
  if (person.linkedin) {
    const n = (person.links || []).length + 1;
    lines.push(`item${n}.URL:${vEsc(person.linkedin)}`);
    lines.push(`item${n}.X-ABLabel:LinkedIn`);
  }
  if (person.summary) lines.push(`NOTE:${vEsc(person.summary)}`);
  if (photoPath) {
    const ext = path.extname(photoPath).toLowerCase();
    const type = ext === '.png' ? 'PNG' : 'JPEG';
    const b64 = fs.readFileSync(photoPath).toString('base64');
    lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${b64}`);
  }
  lines.push('REV:' + new Date().toISOString());
  lines.push('END:VCARD');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

// ---------- card page ----------
// "William H." + "Floyd IV" → word-by-word reveal, last name in italic red
// serif with the hand-drawn underline (the compression-tool signature move).
function buildNameHtml(person) {
  const parts = [];
  let d = 180;
  for (const w of String(person.firstName || '').trim().split(/\s+/).filter(Boolean)) {
    parts.push(`<span class="reveal-word" style="--d:${d}ms">${esc(w)}</span>`);
    d += 70;
  }
  const last = String(person.lastName || '').trim();
  if (last) {
    d += 120;
    parts.push(`<span class="reveal-word accent-serif" style="--d:${d}ms"><em>${esc(last)}</em></span>`);
  }
  return parts.join('\n      ');
}

function buildActions(person) {
  const a = [];
  if (person.mobile) {
    a.push(`<a class="qa" href="tel:${telHref(person.mobile)}"><span class="qa-btn">${ICONS.phone}</span><span class="qa-label">CALL</span></a>`);
    a.push(`<a class="qa" href="sms:${telHref(person.mobile)}"><span class="qa-btn">${ICONS.sms}</span><span class="qa-label">TEXT</span></a>`);
  }
  if (person.workPhone) a.push(`<a class="qa" href="tel:${telHref(person.workPhone)}"><span class="qa-btn">${ICONS.phone}</span><span class="qa-label">OFFICE</span></a>`);
  if (person.email) a.push(`<a class="qa" href="mailto:${esc(person.email)}"><span class="qa-btn">${ICONS.email}</span><span class="qa-label">EMAIL</span></a>`);
  return a.join('\n      ');
}

function buildContactRows(person) {
  const rows = [];
  if (person.mobile) rows.push(`<a class="row" href="tel:${telHref(person.mobile)}"><span class="label">Mobile</span><span class="value">${esc(person.mobile)}</span></a>`);
  if (person.workPhone) rows.push(`<a class="row" href="tel:${telHref(person.workPhone)}"><span class="label">Work Phone</span><span class="value">${esc(person.workPhone)}</span></a>`);
  if (person.email) rows.push(`<a class="row" href="mailto:${esc(person.email)}"><span class="label">Email</span><span class="value">${esc(person.email)}</span></a>`);
  rows.push(`<div class="row"><span class="label">Company</span><span class="value">${esc(person.company || site.company)}</span></div>`);
  return rows.join('\n    ');
}

function buildExtraSections(person, cardart) {
  const sections = [];
  let delay = 1180;

  if (person.summary) {
    sections.push(`<section class="panel reveal-fade" style="--d:${delay}ms">
    <h2 class="panel-title">About <em>me</em><span class="title-period">.</span></h2>
    <div class="row"><span class="value" style="font-weight:500">${esc(person.summary)}</span></div>
  </section>`);
    delay += 100;
  }

  const links = [];
  (person.links || []).forEach(l => {
    links.push(`<a class="linkrow" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="badge">${ICONS.globe}</span>${esc(l.label)}<span class="go">→</span></a>`);
  });
  if (person.linkedin) {
    links.push(`<a class="linkrow" href="${esc(person.linkedin)}" target="_blank" rel="noopener"><span class="badge">${ICONS.linkedin}</span>LinkedIn<span class="go">→</span></a>`);
  }
  if (links.length) {
    sections.push(`<section class="panel reveal-fade" style="--d:${delay}ms">
    <h2 class="panel-title">On the <em>web</em><span class="title-period">.</span></h2>
    ${links.join('\n    ')}
  </section>`);
    delay += 100;
  }

  if (cardart.front || cardart.back) {
    const imgs = [];
    if (cardart.front) imgs.push(`<img src="${cardart.front}" alt="Business card front" style="width:100%;border-radius:12px;border:1px solid var(--line-soft);box-shadow:var(--shadow-md);display:block">`);
    if (cardart.back) imgs.push(`<img src="${cardart.back}" alt="Business card back" style="width:100%;border-radius:12px;border:1px solid var(--line-soft);box-shadow:var(--shadow-md);display:block">`);
    sections.push(`<section class="panel reveal-fade" style="--d:${delay}ms">
    <h2 class="panel-title">The card <em>itself</em><span class="title-period">.</span></h2>
    <div style="display:flex;flex-direction:column;gap:14px;padding:6px 0 10px">${imgs.join('\n')}</div>
  </section>`);
  }

  return sections.join('\n\n  ');
}

function buildAnalytics(person) {
  if (!site.analyticsEndpoint) return '';
  return `<script>
  try {
    navigator.sendBeacon(${JSON.stringify(site.analyticsEndpoint)}, JSON.stringify({
      card: ${JSON.stringify(person.slug)},
      t: Date.now(),
      ref: document.referrer,
      ua: navigator.userAgent
    }));
  } catch (e) {}
</script>`;
}

function renderCard(person, photoFile, cardart) {
  const photoHtml = photoFile
    ? `<img src="${photoFile}" alt="${esc(person.displayName)}">`
    : `<div class="initials">${esc(initials(person))}</div>`;
  return template
    .replaceAll('{{COMPANY_UPPER}}', esc((person.company || site.company).toUpperCase()))
    .replaceAll('{{COMPANY}}', esc(person.company || site.company))
    .replaceAll('{{DISPLAY_NAME}}', esc(person.displayName))
    .replaceAll('{{ROLE_TITLE}}', esc(person.title))
    .replaceAll('{{NAME_HTML}}', buildNameHtml(person))
    .replaceAll('{{PHOTO_HTML}}', photoHtml)
    .replaceAll('{{ACTIONS_HTML}}', buildActions(person))
    .replaceAll('{{CONTACT_ROWS}}', buildContactRows(person))
    .replaceAll('{{EXTRA_SECTIONS}}', buildExtraSections(person, cardart))
    .replaceAll('{{VCF_FILENAME}}', 'contact.vcf')
    .replaceAll('{{VCF_DOWNLOAD_NAME}}', `${person.slug}.vcf`)
    .replaceAll('{{ANALYTICS_SCRIPT}}', buildAnalytics(person));
}

// ---------- dashboard (docs/index.html) ----------
// The QR-Code-Chimp-style team view: every coworker, a live phone preview
// of their card, and download links — in the compression-tool aesthetic.
function rosterPage(people) {
  const cards = people.map((p, i) => {
    const photoHtml = p._photoFile
      ? `<img src="${p.slug}/${p._photoFile}" alt="">`
      : `<span>${esc(initials(p))}</span>`;
    return `
  <article class="team-card" style="--d:${i * 90}ms">
    <div class="phone-col">
      <a class="phone" href="${p.slug}/" title="Open ${esc(p.displayName)}'s card">
        <span class="phone-notch"></span>
        <iframe src="${p.slug}/" loading="lazy" tabindex="-1" title="Preview of ${esc(p.displayName)}'s card"></iframe>
        <span class="phone-glass"></span>
      </a>
    </div>
    <div class="team-info">
      <div class="team-photo">${photoHtml}</div>
      <h3 class="team-name">${esc(p.displayName)}</h3>
      <p class="team-role">${esc(p.title)}</p>
      <div class="team-links">
        <a class="pill-button primary" href="${p.slug}/">OPEN CARD <span class="arrow">→</span></a>
        <a class="pill-button" href="${p.slug}/contact.vcf" download="${p.slug}.vcf">VCARD</a>
        <a class="pill-button" href="${p.slug}/qr-print.png" download="${p.slug}-qr.png">PRINT QR</a>
      </div>
      <img class="team-qr" src="${p.slug}/qr.svg" alt="QR code for ${esc(p.displayName)}" loading="lazy">
    </div>
  </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(site.company)} — Card HQ</title>
<link rel="icon" type="image/png" href="assets/vista-v.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
:root {
  --vista-black: #14191c;
  --vista-white: #fafafa;
  --vista-red: #b22c2e;
  --vista-red-dark: #8e2123;
  --ink: #14191c;
  --paper: #eceef1;
  --ink-soft: #5a6168;
  --line: #d8dbdf;
  --line-soft: #e3e6ea;
  --shadow-sm: 0 1px 2px rgba(20,25,28,.04), 0 1px 3px rgba(20,25,28,.06);
  --shadow-md: 0 4px 14px rgba(20,25,28,.08), 0 2px 6px rgba(20,25,28,.04);
  --shadow-lg: 0 24px 60px rgba(20,25,28,.10), 0 8px 20px rgba(20,25,28,.06);
  --radius: 14px;
  --radius-lg: 22px;
  --t: 220ms cubic-bezier(.22,.61,.36,1);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--paper);
  color: var(--ink);
  font-family: 'Manrope', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
body {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(900px 500px at 88% -200px, rgba(181,217,238,.20), transparent 60%),
    radial-gradient(700px 400px at -80px 600px, rgba(235,170,31,.08), transparent 60%),
    var(--paper);
  overflow-x: hidden;
}
.bg-grid { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 0; display: block; }
.bg-grain {
  position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: .18; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.08  0 0 0 0 0.10  0 0 0 0 0.11  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
.site-header, main, .site-footer { position: relative; z-index: 2; }
.site-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 40px;
  border-bottom: 1px solid var(--line);
  background: rgba(250,250,250,.7);
  backdrop-filter: blur(10px);
  position: sticky; top: 0; z-index: 10;
}
.brand { display: flex; align-items: center; gap: 14px; }
.brand-mark { width: 38px; height: 38px; object-fit: contain; transition: transform var(--t); }
.brand:hover .brand-mark { transform: translateY(-2px) rotate(-3deg); }
.brand-name {
  font-family: 'Space Grotesk', sans-serif; font-weight: 700;
  letter-spacing: .04em; font-size: 18px; line-height: 1;
  display: inline-flex; align-items: baseline; gap: 6px;
}
em.brand-name-light {
  font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 700;
  color: var(--vista-red); font-size: 1.22em;
}
.brand-tag { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: .18em; color: var(--ink-soft); margin-top: 4px; }
.meta-pill {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: .12em;
  padding: 8px 14px; border-radius: 999px;
  background: var(--vista-black); color: var(--vista-white);
  display: inline-flex; align-items: center; gap: 8px;
}
.meta-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80; animation: pulse 1.8s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
@media (max-width: 560px) { .meta-pill { display: none; } .site-header { padding: 16px 20px; } }

main { flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 56px 40px 80px; }
@media (max-width: 640px) { main { padding: 40px 20px 64px; } }

.hero { margin-bottom: 48px; max-width: 880px; }
.hero-eyebrow {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: .22em;
  color: var(--ink-soft); text-transform: uppercase;
  margin-bottom: 22px; padding: 7px 14px;
  border: 1px solid var(--line); border-radius: 999px;
  background: rgba(255,255,255,.55); backdrop-filter: blur(6px);
}
.eye-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vista-red); box-shadow: 0 0 10px rgba(178,44,46,.6); animation: pulse 2s ease-in-out infinite; }
.hero-title {
  font-family: 'Space Grotesk', sans-serif; font-weight: 700;
  font-size: clamp(40px, 6vw, 72px); line-height: 1.02; letter-spacing: -.035em;
  margin-bottom: 24px;
}
.hero-title .accent-serif {
  font-family: 'Instrument Serif', serif; font-weight: 400; font-style: italic;
  color: var(--vista-red); font-size: 1.16em; position: relative;
}
.hero-title .accent-serif em { font-style: italic; position: relative; display: inline-block; }
.hero-title .accent-serif em::after {
  content: ''; position: absolute; left: -2%; right: -2%; bottom: -.04em; height: 8px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 8' preserveAspectRatio='none'><path d='M2 5 C 40 1, 80 7, 120 3 S 180 6, 198 4' stroke='%23b22c2e' stroke-width='2.5' fill='none' stroke-linecap='round'/></svg>");
  background-size: 100% 100%; background-repeat: no-repeat;
  transform-origin: left center;
  animation: drawLine 700ms 1000ms cubic-bezier(.65,0,.35,1) both;
}
@keyframes drawLine { 0%{transform:scaleX(0);opacity:0} 100%{transform:scaleX(1);opacity:1} }
.reveal-word { display: inline-block; opacity: 0; transform: translateY(28px); animation: revealWord 720ms cubic-bezier(.22,.61,.36,1) forwards; animation-delay: var(--d, 0ms); }
@keyframes revealWord { to { opacity: 1; transform: translateY(0); } }
.reveal-fade { opacity: 0; animation: revealFade 600ms ease forwards; animation-delay: var(--d, 0ms); }
@keyframes revealFade { to { opacity: 1; } }
.hero-sub { font-size: 18px; line-height: 1.55; color: var(--ink-soft); max-width: 640px; }
.hero-sub-emphasis {
  display: block; margin-top: 12px; color: var(--vista-red);
  font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.45em;
}

.team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 24px; }
@media (max-width: 560px) { .team-grid { grid-template-columns: 1fr; } }

.team-card {
  background: white;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  display: flex;
  gap: 22px;
  transition: all var(--t);
  animation: cardIn 560ms cubic-bezier(.22,.61,.36,1) both;
  animation-delay: var(--d, 0ms);
}
@keyframes cardIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
.team-card:hover { border-color: var(--vista-black); transform: translateY(-3px); box-shadow: var(--shadow-lg); }
@media (max-width: 520px) { .team-card { flex-direction: column; align-items: center; text-align: center; } }

/* Phone-frame live preview — the little window into the real card page */
.phone-col { flex-shrink: 0; }
.phone {
  display: block;
  position: relative;
  width: 148px;
  height: 300px;
  border-radius: 22px;
  background: var(--vista-black);
  padding: 7px;
  box-shadow: var(--shadow-md);
  overflow: hidden;
  transition: transform var(--t), box-shadow var(--t);
}
.phone:hover { transform: translateY(-4px) rotate(-1.2deg); box-shadow: 0 20px 50px rgba(20,25,28,.25); }
.phone-notch {
  position: absolute; top: 7px; left: 50%; transform: translateX(-50%);
  width: 44px; height: 12px;
  background: var(--vista-black);
  border-radius: 0 0 10px 10px;
  z-index: 3;
}
.phone iframe {
  width: 375px;
  height: 764px;
  border: 0;
  border-radius: 16px;
  background: var(--paper);
  transform: scale(0.3573);
  transform-origin: top left;
  pointer-events: none;
}
.phone-glass { position: absolute; inset: 0; z-index: 2; }

.team-info { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; position: relative; }
@media (max-width: 520px) { .team-info { align-items: center; } }
.team-photo {
  width: 58px; height: 58px; border-radius: 50%;
  overflow: hidden; border: 3px solid white;
  box-shadow: var(--shadow-md);
  background: #fbeaea;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; color: var(--vista-red);
  margin-bottom: 12px;
}
.team-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.team-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: -.01em; margin-bottom: 4px; }
.team-role { font-size: 13px; color: var(--ink-soft); line-height: 1.45; margin-bottom: 16px; }
.team-links { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.pill-button {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; font-weight: 500;
  letter-spacing: .08em;
  color: var(--ink);
  background: white; border: 1.5px solid var(--line); border-radius: 999px;
  padding: 8px 14px;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--t);
  box-shadow: var(--shadow-sm);
}
.pill-button:hover { background: var(--vista-red); color: white; border-color: var(--vista-red); transform: translateY(-1px); box-shadow: 0 8px 22px rgba(178,44,46,.20); }
.pill-button.primary { background: var(--vista-black); color: white; border-color: var(--vista-black); }
.pill-button.primary:hover { background: var(--vista-red); border-color: var(--vista-red); }
.pill-button .arrow { transition: transform var(--t); }
.pill-button:hover .arrow { transform: translateX(3px); }
.team-qr {
  width: 64px; height: 64px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 4px;
  background: white;
  margin-top: auto;
}

.site-footer {
  text-align: center; padding: 28px 16px 36px;
  font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: .18em;
  text-transform: uppercase; color: var(--ink-soft); opacity: .75;
}
.site-footer em { font-family: 'Instrument Serif', serif; font-style: italic; color: var(--vista-red); font-size: 1.3em; text-transform: none; }
</style>
</head>
<body>

<header class="site-header">
  <div class="brand">
    <img src="assets/vista-v.png" alt="" class="brand-mark">
    <div class="brand-text">
      <div class="brand-name">VISTA <em class="brand-name-light">Cards</em></div>
      <div class="brand-tag">TEAM CARD HEADQUARTERS</div>
    </div>
  </div>
  <span class="meta-pill"><span class="meta-dot"></span>${people.length} CARD${people.length === 1 ? '' : 'S'} · SELF-HOSTED · NO SUBSCRIPTION</span>
</header>

<canvas id="bgGrid" class="bg-grid" aria-hidden="true"></canvas>
<div class="bg-grain" aria-hidden="true"></div>

<main>
  <section class="hero">
    <div class="hero-eyebrow reveal-fade" style="--d:60ms"><span class="eye-dot"></span><span>VISTA · INTERNAL TOOL · CARD HQ</span></div>
    <h1 class="hero-title">
      <span class="reveal-word" style="--d:0ms">Your</span>
      <span class="reveal-word" style="--d:70ms">team.</span>
      <span class="reveal-word accent-serif" style="--d:220ms"><em>Your&nbsp;cards.</em></span><br>
      <span class="reveal-word" style="--d:420ms">Your</span>
      <span class="reveal-word" style="--d:490ms">rules.</span>
    </h1>
    <p class="hero-sub reveal-fade" style="--d:700ms">
      Every ${esc(site.company)} digital business card in one place — preview them live,
      grab the vCard, download print-ready QR codes.
      <span class="hero-sub-emphasis">No subscription. Nobody holding our cards hostage.</span>
    </p>
  </section>

  <section class="team-grid">
${cards}
  </section>
</main>

<footer class="site-footer">${esc(site.company.toUpperCase())} · <em>find the perfect site</em></footer>

<script src="assets/grid-bg.js"></script>
</body>
</html>`;
}

// ---------- main ----------
async function main() {
  const peopleDir = path.join(ROOT, 'people');
  const files = fs.readdirSync(peopleDir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) { console.error('No people/*.json files found.'); process.exit(1); }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  // shared brand assets
  const assetOut = path.join(OUT, 'assets');
  fs.mkdirSync(assetOut, { recursive: true });
  for (const a of SHARED_ASSETS) {
    const src = path.join(ROOT, 'assets', a);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assetOut, a));
  }

  const people = [];
  for (const file of files) {
    const person = JSON.parse(fs.readFileSync(path.join(peopleDir, file), 'utf8'));
    const dir = path.join(OUT, person.slug);
    fs.mkdirSync(dir, { recursive: true });

    // headshot — web copy (page) + compact copy (embedded in the vCard)
    const photoSrc = findImage(PHOTO_DIR, person.slug);
    person._photoFile = null;
    let vcfPhoto = null;
    if (photoSrc) {
      const webPhoto = path.join(dir, 'photo.jpg');
      if (resizeImage(photoSrc, webPhoto, 800, 85)) {
        person._photoFile = 'photo.jpg';
      } else {
        person._photoFile = 'photo' + path.extname(photoSrc).toLowerCase();
        fs.copyFileSync(photoSrc, path.join(dir, person._photoFile));
      }
      const thumb = path.join(dir, '.vcf-photo.jpg');
      if (resizeImage(photoSrc, thumb, 480, 80)) {
        vcfPhoto = thumb;
      } else if (['.jpg', '.jpeg', '.png'].includes(path.extname(photoSrc).toLowerCase())) {
        vcfPhoto = photoSrc;
      }
    }

    // printed card art (front/back), optional — downscaled for the web
    const cardart = {};
    for (const side of ['front', 'back']) {
      const src = findImage(CARDART_DIR, `${person.slug}-${side}`);
      if (src) {
        const name = `card-${side}.jpg`;
        if (resizeImage(src, path.join(dir, name), 1400, 88)) {
          cardart[side] = name;
        } else {
          const raw = `card-${side}${path.extname(src).toLowerCase()}`;
          fs.copyFileSync(src, path.join(dir, raw));
          cardart[side] = raw;
        }
      }
    }

    // page + vcard
    fs.writeFileSync(path.join(dir, 'index.html'), renderCard(person, person._photoFile, cardart));
    fs.writeFileSync(path.join(dir, 'contact.vcf'), buildVcf(person, vcfPhoto));
    if (vcfPhoto && vcfPhoto.endsWith('.vcf-photo.jpg')) fs.unlinkSync(vcfPhoto);

    // QR codes → the person's card URL
    const url = site.baseUrl.replace(/\/$/, '') + '/' + person.slug + '/';
    const qrOpts = { errorCorrectionLevel: 'H', margin: 2, color: { dark: site.brand.primary, light: '#ffffff' } };
    await QRCode.toFile(path.join(dir, 'qr.svg'), url, { ...qrOpts, type: 'svg' });
    await QRCode.toFile(path.join(dir, 'qr-print.png'), url, { ...qrOpts, width: 1200 });

    people.push(person);
    console.log(`✔ ${person.displayName}  →  docs/${person.slug}/  (${url})${photoSrc ? '' : '  [no photo — using initials]'}`);
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), rosterPage(people));
  console.log(`\nBuilt ${people.length} card(s) + dashboard into docs/. Deploy docs/ anywhere static (GitHub Pages, any server).`);
}

main().catch(e => { console.error(e); process.exit(1); });
