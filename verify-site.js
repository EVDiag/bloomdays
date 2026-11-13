#!/usr/bin/env node
// verify-site.js — the checks for bloomdays.family (plain Node 22, no packages).
// Run: node verify-site.js          (SITE_ONLY=1,4 runs sections; SITE_ROOT, SITE_PORT)
// Browser sections need Playwright; without it they print SKIP and count nothing.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const ROOT = path.resolve(process.env.SITE_ROOT || __dirname);
const PORT = +(process.env.SITE_PORT || 8730);
const ONLY = (process.env.SITE_ONLY || '').split(',').filter(Boolean).map(Number);
const ORIGIN = `http://localhost:${PORT}`;

// today's assetlinks.json (731cf61), byte for byte
const ASSETLINKS_SHA = 'ba738b9df485d5fd4049d17ce3313b69d76a8e39e847125c1dd260a1ce5614ad';
const PAGES_SPEC = ['index.html', 'support.html', 'privacy.html', 'terms.html', '404.html'];
const PAGES = PAGES_SPEC.filter(f => fs.existsSync(path.join(ROOT, f)));
// every page of every language (the English pages first); the generic checks (§5 requests, §11 phones) run over all of them
const XX_LANGS = ['cs', 'ru', 'th', 'zh'];
const XX_PAGES = XX_LANGS.flatMap(l => ['index.html', 'support.html', 'privacy.html'].map(p => `${l}/${p}`)).filter(f => fs.existsSync(path.join(ROOT, f)));
const ALL_PAGES = [...PAGES, ...XX_PAGES];
const BADGE_LINE = 'Coming soon to the App Store and Google Play.';

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; }
  else { failed++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(n, title) {
  if (ONLY.length && !ONLY.includes(n)) return false;
  console.log(`§${n} ${title}`);
  return true;
}

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readBuf = f => fs.readFileSync(path.join(ROOT, f));
const exists = f => fs.existsSync(path.join(ROOT, f));
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const noComments = html => html.replace(/<!--[\s\S]*?-->/g, '');
const pageText = f => noComments(read(f));
// visible text, tags removed
const textOf = html => noComments(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ');
function between(html, re) { const m = html.match(re); return m ? m[0] : ''; }
function webpSize(b) {   // VP8 / VP8L / VP8X header
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const k = b.toString('ascii', 12, 16);
  if (k === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (k === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  if (k === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  return null;
}
function idsOf(html) { return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])); }

// ── a server that behaves like GitHub Pages ─────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function resolveFile(root, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (p.includes('..')) return null;
  const abs = path.join(root, p);
  const tryFile = f => (fs.existsSync(f) && fs.statSync(f).isFile()) ? f : null;
  if (p.endsWith('/')) return tryFile(path.join(abs, 'index.html'));
  return tryFile(abs) || tryFile(abs + '.html') || (fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? tryFile(path.join(abs, 'index.html')) : null);
}
function serve(root) {
  return http.createServer((req, res) => {
    const f = resolveFile(root, req.url);
    if (f) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(f));
    }
    const nf = path.join(root, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
  });
}
function get(p) {
  return new Promise((ok, no) => http.get(ORIGIN + p, r => { const b = []; r.on('data', d => b.push(d)); r.on('end', () => ok({ status: r.statusCode, type: r.headers['content-type'], body: Buffer.concat(b) })); }).on('error', no));
}

// ── Playwright, if present ───────────────────────────────────────────────────
let playwright = null;
try { playwright = require('playwright'); } catch { try { playwright = require('/root/pwtest/node_modules/playwright'); } catch {} }
let browser = null;
async function getBrowser() { if (!browser) browser = await playwright.chromium.launch(); return browser; }
async function withPage(p, opts, fn) {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: opts.width || 390, height: opts.height || 844 }, javaScriptEnabled: opts.js !== false, ...(opts.ctx || {}) });
  if (opts.permissions) await ctx.grantPermissions(opts.permissions, { origin: ORIGIN });
  const page = await ctx.newPage();
  page.setDefaultTimeout(2500);
  if (opts.before) await opts.before(page);
  try {
    await page.goto(ORIGIN + p, { waitUntil: 'load' });
    return await fn(page);
  } finally { await ctx.close(); }
}
const browserSection = (n, title) => {
  if (!section(n, title)) return false;
  if (!playwright) { console.log(`  SKIP §${n}: playwright not installed`); return false; }
  return true;
};

// ── internal links of a page ────────────────────────────────────────────────
function refsOf(html) {
  const out = [];
  for (const m of html.matchAll(/\s(href|src)="([^"]*)"/g)) out.push({ attr: m[1], url: m[2] });
  for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) out.push({ attr: 'srcset', url: part.trim().split(/\s+/)[0] });
  return out;
}
const isExternal = u => /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//');

async function main() {
  const server = serve(ROOT);
  await new Promise(r => server.listen(PORT, r));
  try {
    // ── §1 files and addresses
    if (section(1, 'files and addresses')) {
      check('assetlinks.json unchanged', exists('.well-known/assetlinks.json') && sha256(readBuf('.well-known/assetlinks.json')) === ASSETLINKS_SHA);
      check('CNAME is bloomdays.family', exists('CNAME') && read('CNAME').trim() === 'bloomdays.family');
      check('.nojekyll kept', exists('.nojekyll'));
      for (const f of ['data-safety-form-answers.md', 'health-declaration-answers.md', 'terms.md']) check(`${f} is gone`, !exists(f));
      for (const f of ['index.html', 'privacy.html', '404.html']) check(`${f} exists`, exists(f));
      const al = await get('/.well-known/assetlinks.json');
      check('GET /.well-known/assetlinks.json → 200 application/json, same bytes', al.status === 200 && /application\/json/.test(al.type) && sha256(al.body) === ASSETLINKS_SHA, `${al.status} ${al.type}`);
      const pv = await get('/privacy.html');
      check('GET /privacy.html → 200', pv.status === 200);
      const nf = await get('/nope-' + Date.now());
      check('GET /nope → 404 and the 404 page', nf.status === 404 && exists('404.html') && nf.body.equals(readBuf('404.html')));
    }

    // ── §2 links and the frame
    if (section(2, 'links and the frame')) {
      const heads = [], foots = [];
      for (const f of PAGES) {
        const h = pageText(f);
        for (const r of refsOf(h)) {
          const u = r.url;
          if (!u || u.startsWith('mailto:') || u.startsWith('tel:')) continue;
          if (isExternal(u)) continue;
          if (u.startsWith('#')) { check(`${f}: anchor ${u} exists`, idsOf(h).has(u.slice(1))); continue; }
          const target = resolveFile(ROOT, u.startsWith('/') ? u : '/' + u);
          check(`${f}: ${r.attr}="${u}" resolves`, !!target);
          const frag = u.split('#')[1];
          if (target && frag && target.endsWith('.html')) check(`${f}: ${u} — #${frag} exists`, idsOf(fs.readFileSync(target, 'utf8')).has(frag));
        }
        for (const need of ['/support.html', '/privacy.html', '/terms.html', 'mailto:support@bloomdays.family'])
          check(`${f} links ${need}`, h.includes(`href="${need}"`));
        heads.push(between(h, /<header class="site-head"[\s\S]*?<\/header>/).replace(/ aria-current="page"/g, '').replace(/\s*<nav class="lang-switch"[\s\S]*?<\/nav>/, ''));
        foots.push(between(h, /<footer class="site-foot"[\s\S]*?<\/footer>/));
        check(`${f}: has the header`, !!heads[heads.length - 1]);
        check(`${f}: has the footer`, !!foots[foots.length - 1]);
        check(`${f}: lang="en"`, /<html lang="en"/.test(h));
        check(`${f}: <title>`, /<title>[^<]{3,}<\/title>/.test(h));
        check(`${f}: meta description`, /<meta name="description" content="[^"]{20,}"/.test(h));
        const canon = f === '404.html' ? null : `https://bloomdays.family/${f === 'index.html' ? '' : f}`;
        if (canon) check(`${f}: canonical ${canon}`, h.includes(`<link rel="canonical" href="${canon}">`));
        check(`${f}: og:image`, h.includes('<meta property="og:image" content="https://bloomdays.family/img/og.png">'));
        check(`${f}: og:title, og:description, og:url`, /property="og:title"/.test(h) && /property="og:description"/.test(h) && /property="og:url"/.test(h));
        check(`${f}: color-scheme light`, h.includes('<meta name="color-scheme" content="light">'));
        check(`${f}: theme-color #f9f2e8`, h.includes('<meta name="theme-color" content="#f9f2e8">'));
        check(`${f}: favicon and apple-touch-icon`, h.includes('href="/favicon.png"') && h.includes('href="/apple-touch-icon.png"'));
        check(`${f}: site.css and site.js`, h.includes('href="/css/site.css"') && /<script src="\/js\/site\.js" defer><\/script>/.test(h));
      }
      check('header identical on every page', heads.length > 0 && heads.every(x => x && x === heads[0]));
      check('footer identical on every page', foots.length > 0 && foots.every(x => x && x === foots[0]));
      check('CSS: :root color-scheme light', exists('css/site.css') && /:root\s*\{[^}]*color-scheme:\s*light/.test(read('css/site.css')));
      if (exists('css/site.css')) for (const m of read('css/site.css').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
        if (isExternal(m[1]) || m[1].startsWith('data:')) continue;
        check(`site.css url(${m[1]}) resolves`, !!resolveFile(ROOT, m[1].startsWith('/') ? m[1] : '/css/' + m[1]));
      }
    }

    // ── §3 words
    if (section(3, 'words')) {
      const BAN = ['android', 'available on google play', 'coming to google play', 'google play only', 'evdiag', 'evdiag.net', 's.r.o', 'bloom.app',
        '[your', 'end-to-end', 'encrypted at rest', 'firebase', 'crashlytics', 'mama', 'security audit'];
      for (const f of PAGES) {
        const low = pageText(f).toLowerCase();
        for (const w of BAN) check(`${f}: no "${w}"`, !low.includes(w));
        for (const w of ['bonus ask bloom', 'extra ask bloom questions', 'natural birth control', 'used as birth control', 'keeps every call', 'stores your chats'])
          check(`${f}: no claim "${w}"`, !low.includes(w));
        check(`${f}: "analytics" only in "no analytics"`, !/analytics/.test(low.replace(/no analytics/g, '')));
        check(`${f}: Google Play never without App Store`, !low.includes('google play') || low.includes('app store'));
        const soon = (low.match(/coming soon/g) || []).length, line = (low.match(new RegExp(BADGE_LINE.toLowerCase().replace(/\./g, '\\.'), 'g')) || []).length;
        check(`${f}: "coming soon" only in the badge line`, soon === line, `${soon} vs ${line}`);
        const foot = between(pageText(f), /<footer class="site-foot"[\s\S]*?<\/footer>/).toLowerCase();
        check(`${f}: footer says not birth control`, foot.includes('not birth control'));
        if (['index.html', 'support.html', 'terms.html'].includes(f)) {
          const main = between(pageText(f), /<main[\s\S]*?<\/main>/).toLowerCase();
          check(`${f}: main says not birth control`, main.includes('not birth control'));
        }
        check(`${f}: Roman Franta only in privacy and terms`, ['privacy.html', 'terms.html'].includes(f) || !low.includes('roman franta'));
        // App Store before Google Play wherever both badges stand
        for (const m of pageText(f).matchAll(/<div class="badges"[\s\S]*?<\/div>/g)) {
          const a = m[0].indexOf('data-store="appStore"'), g = m[0].indexOf('data-store="googlePlay"');
          check(`${f}: App Store badge before Google Play badge`, a >= 0 && g > a);
        }
      }
    }

    // ── §5 no outside requests
    if (section(5, 'no outside requests')) {
      const ALLOW = ['apps.apple.com', 'play.google.com', 'www.anthropic.com', 'anthropic.com', 'privacy.anthropic.com', 'openai.com', 'platform.openai.com',
        'www.revenuecat.com', 'www.cloudflare.com', 'resend.com', 'www.apple.com', 'policies.google.com', 'developer.apple.com', 'reportaproblem.apple.com',
        'support.google.com', 'bloomdays.family', 'privacy.claude.com', 'developers.openai.com', 'www.revenuecat.com', 'www.cloudflare.com', 'www.pdpc.gov.sg', 'commission.europa.eu', 'edpb.europa.eu', 'ico.org.uk', 'oag.ca.gov', 'www.atg.wa.gov', 'support.apple.com'];
      for (const f of ALL_PAGES) {
        const h = pageText(f);
        for (const m of h.matchAll(/<(\w+)\b[^>]*\s(href|src|srcset)="([^"]*)"/g)) {
          const [, tag, attr, u] = m;
          if (!/^(https?:)?\/\//i.test(u)) continue;
          const host = new URL(u, 'https://x/').host;
          if (tag.toLowerCase() === 'a' && attr === 'href') check(`${f}: link to ${host} is allowed`, ALLOW.includes(host));
          else if (tag.toLowerCase() === 'link' && /rel="canonical"/.test(m[0])) check(`${f}: canonical is bloomdays.family`, host === 'bloomdays.family');
          else if (tag.toLowerCase() === 'link' && /rel="alternate"/.test(m[0])) check(`${f}: an alternate is bloomdays.family`, host === 'bloomdays.family');
          else check(`${f}: no outside request <${tag} ${attr}="${u}">`, false);
        }
        check(`${f}: no @import`, !/@import/.test(h));
        check(`${f}: no inline url() to another host`, !/url\(\s*['"]?(https?:)?\/\//i.test(h));
        // og:image and og:url are metadata, not requests: they name bloomdays.family only
        for (const m of h.matchAll(/<meta property="og:(image|url)" content="([^"]+)">/g)) check(`${f}: og:${m[1]} on bloomdays.family`, m[2].startsWith('https://bloomdays.family/'));
      }
      for (const f of ['css/site.css', 'js/site.js', 'js/support.js'].filter(exists)) {
        const s = read(f);
        check(`${f}: no @import`, !/@import/.test(s));
        check(`${f}: no url() to another host`, !/url\(\s*['"]?(https?:)?\/\//i.test(s));
        check(`${f}: no fetch to another host`, !/fetch\(\s*['"`](https?:)?\/\//.test(s));
        const hosts = [...new Set([...s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]))];
        check(`${f}: names only known hosts`, hosts.every(h => ['play.google.com', 'apps.apple.com', 'bloomdays-contact.evdiag.workers.dev'].includes(h)), hosts.join(' '));
        check(`${f}: adds no script, frame or stylesheet`, !/createElement\(\s*['"](script|iframe|link)['"]/.test(s) && !/import\(\s*['"`]https?:/.test(s));
      }
    }

    // ── §6 the 404 and the invite
    if (browserSection(6, '404 and the invite')) {
      const inv = async (p) => withPage(p, {}, async page => ({
        invite: await page.locator('#invite').isVisible(), notfound: await page.locator('#notfound').isVisible(),
        code: (await page.locator('[data-code]').textContent().catch(() => '')) || '',
        play: await page.locator('#invite [data-store="googlePlay"]').getAttribute('href').catch(() => null),
      }));
      let r = await inv('/r/ABC123');
      check('/r/ABC123 → the invite, not the not-found', r.invite && !r.notfound);
      check('/r/ABC123 → the code ABC123', r.code.trim() === 'ABC123', r.code);
      check('/r/ABC123 → the Google Play badge carries referrer=code%3DABC123', !!r.play && r.play.includes('id=family.bloomdays') && r.play.includes('referrer=code%3DABC123'), String(r.play));
      for (const p of ['/r/abc123', '/r/ABC123/', '/r/ABC123?utm_source=whatsapp']) {
        r = await inv(p);
        check(`${p} → the invite with ABC123`, r.invite && !r.notfound && r.code.trim() === 'ABC123', JSON.stringify(r));
      }
      for (const p of ['/r/AB', '/r/ABC-123', '/r/ABC123/extra', '/r/ABCDEFGHIJKLM', '/nothing']) {
        r = await inv(p);
        check(`${p} → the plain not-found`, !r.invite && r.notfound, JSON.stringify(r));
      }
      await withPage('/nothing', {}, async page => {
        check('not-found: a link home', await page.locator('#notfound a[href="/index.html"]').count() > 0);
        check('the "Have the app?" line is visible', await page.getByText('Have the app? Open this link on your phone.').isVisible());
        check('404 is noindex', (await page.content()).includes('<meta name="robots" content="noindex">'));
      });
      await withPage('/r/ABC123', { js: false }, async page => {
        check('JS off: the not-found is visible', await page.locator('#notfound').isVisible());
        check('JS off: the "Have the app?" line is visible', await page.getByText('Have the app? Open this link on your phone.').isVisible());
        check('JS off: the invite is hidden', !(await page.locator('#invite').isVisible()));
        check('JS off: no Menu button (the links show as a row)', !(await page.locator('.nav-toggle').isVisible()) && await page.locator('#site-nav a').first().isVisible());
      });
      await withPage('/r/ABC123', { permissions: ['clipboard-read', 'clipboard-write'] }, async page => {
        await page.locator('#invite [data-copy]').click();
        await page.waitForTimeout(150);
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        check('Copy puts the code on the clipboard', clip === 'ABC123', clip);
        check('the Copy button then reads Copied', (await page.locator('#invite [data-copy]').textContent()).trim() === 'Copied');
      });
    }

    for (const extra of SECTIONS) await extra();
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  console.log(`========== ${passed} passed, ${failed} failed ==========`);
  process.exitCode = failed ? 1 : 0;
}

// later sections push here (kept below so the file reads in order)
const SECTIONS = [];

// ── §4 home
SECTIONS.push(async () => {
  if (!section(4, 'home')) return;
  const h = pageText('index.html'), main = between(h, /<main[\s\S]*?<\/main>/);
  const order = ['chapters', 'ask', 'family', 'privacy', 'pro', 'get'].map(id => main.indexOf(`id="${id}"`));
  check('six anchors exist', order.every(i => i >= 0), JSON.stringify(order));
  check('…in order: chapters ask family privacy pro get', order.every((v, i) => i === 0 || v > order[i - 1]));
  const heroEnd = main.indexOf('id="chapters"');
  check('hero: <h1>Bloom</h1>', /<h1[^>]*>Bloom<\/h1>/.test(main.slice(0, heroEnd)));
  check('hero: both badges before #chapters', main.slice(0, heroEnd).includes('data-store="appStore"') && main.slice(0, heroEnd).includes('data-store="googlePlay"'));
  check('hero: no "coming soon" line (Roman, 2026-11-13: the buttons link to the stores)', !main.includes('badge-note'));
  const chap = between(main, /<section[^>]*id="chapters"[\s\S]*?<\/section>/);
  const cards = [...chap.matchAll(/<article class="card chapter"[\s\S]*?<\/article>/g)].map(m => m[0]);
  check('five chapter cards', cards.length === 5, String(cards.length));
  ['Cycle', 'Trying', 'Pregnant', 'Newborn', 'Menopause'].forEach((n, i) => check(`chapter ${i + 1} is ${n}`, !!cards[i] && new RegExp(`<h3[^>]*>${n}</h3>`).test(cards[i])));
  cards.forEach((c, i) => { const m = c.match(/<img[^>]*src="([^"]+)"/); check(`chapter ${i + 1}: a picture that exists`, !!m && exists(m[1].replace(/^\//, ''))); });
  const ask = between(main, /<section[^>]*id="ask"[\s\S]*?<\/section>/);
  check('#ask links /privacy.html#ai', ask.includes('href="/privacy.html#ai"'));
  check('#ask names Anthropic and OpenAI', /Anthropic/.test(ask) && /OpenAI/.test(ask));
  const fam = between(main, /<section[^>]*id="family"[\s\S]*?<\/section>/);
  check('#family: three faces or more', (fam.match(/src="\/img\/paint\/av-/g) || []).length >= 3);
  const pro = between(main, /<section[^>]*id="pro"[\s\S]*?<\/section>/);
  check('#pro: no price', !!pro && !/[$€£]|USD|\bprice/i.test(textOf(pro)));
  check('#pro: no feature that does not exist yet', !/sweepstake|partner sync|weekly letters/i.test(pro));
  const get = between(main, /<section[^>]*id="get"[\s\S]*?<\/section>/);
  check('#get: not birth control', /not birth control/.test(get));
  check('badge files exist', exists('img/badges/app-store.svg') && exists('img/badges/google-play.svg'));
  check('badges use the official files', main.includes('src="/img/badges/app-store.svg"') && main.includes('src="/img/badges/google-play.svg"'));
  check('one badge pair on the page (Apple: one App Store badge per layout)', (main.match(/data-store="appStore"/g) || []).length === 1);
  const imgs = [...main.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  imgs.forEach((t, i) => check(`img ${i + 1}: width, height, alt`, /\swidth="\d+"/.test(t) && /\sheight="\d+"/.test(t) && /\salt="/.test(t), t.slice(0, 90)));
  const below = [...main.slice(heroEnd).matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  below.forEach((t, i) => check(`img below the hero ${i + 1}: loading="lazy"`, /loading="lazy"/.test(t), t.slice(0, 90)));
  // the page's weight: the HTML, the stylesheet, the scripts, the fonts and every image it shows
  const files = new Set(['index.html', 'css/site.css', 'js/site.js', 'fonts/fraunces-latin-opsz-normal.woff2', 'fonts/fraunces-latin-opsz-italic.woff2', 'fonts/outfit-latin-wght-normal.woff2', 'img/paint/sk-card.webp', 'img/paint/sk-frame.webp', 'img/paint/sk-pill.webp']);
  for (const r of refsOf(h)) if (!isExternal(r.url) && /\.(webp|png|svg|jpg)$/.test(r.url.split('?')[0]) && r.attr !== 'href') files.add(r.url.replace(/^\//, ''));
  const bytes = [...files].filter(exists).reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  // the real screens (Task 3)
  const SHOTS = ['today-pregnant', 'trying-today', 'ask', 'us', 'newborn-now'];
  for (const n of SHOTS) {
    const fig = between(main, new RegExp(`<figure class="phone" data-screen="${n}">[\\s\\S]*?</figure>`));
    const img = (fig.match(/<img\b[^>]*>/) || [''])[0];
    const src = (img.match(/src="\/([^"]+)"/) || [])[1];
    check(`screen ${n}: an <img> in its phone`, !!src && src === `img/screens/${n}.webp`, img.slice(0, 80));
    check(`screen ${n}: alt says what it shows`, /alt="[^"]{12,}"/.test(img));
    if (src && exists(src)) {
      const sz = webpSize(readBuf(src));
      check(`screen ${n}: 780 × 1688`, sz && sz.w === 780 && sz.h === 1688, JSON.stringify(sz));
      check(`screen ${n}: ≤ 180 KB`, fs.statSync(path.join(ROOT, src)).size <= 180 * 1024);
    } else check(`screen ${n}: the file exists`, false);
  }
  check('home ≤ 1.5 MB in all', bytes <= 1.5 * 1024 * 1024, `${(bytes / 1048576).toFixed(2)} MB`);
});

// ── §7 the support page
SECTIONS.push(async () => {
  if (!section(7, 'support page')) return;
  check('support.html exists', exists('support.html'));
  if (!exists('support.html')) return;
  const h = pageText('support.html'), main = between(h, /<main[\s\S]*?<\/main>/);
  check('H1 Questions, bugs and ideas', /<h1[^>]*>Questions, bugs and ideas<\/h1>/.test(main));
  check('support@bloomdays.family as text in main', textOf(main).includes('support@bloomdays.family'));
  check('…and as mailto in main', main.includes('href="mailto:support@bloomdays.family"'));
  const radios = [...main.matchAll(/<input type="radio" name="type" value="(\w+)">\s*([^<]+)</g)].map(m => [m[1], m[2].trim()]);
  check('five types, values and labels exact, in order', JSON.stringify(radios) === JSON.stringify([['bug', 'Report a bug'], ['idea', 'New idea'], ['feature', 'Feature request'], ['feedback', 'Feedback'], ['other', 'Something else']]), JSON.stringify(radios));
  check('email: type=email, name=email, autocomplete=email, required', /<input id="c-email" name="email" type="email" autocomplete="email" required/.test(main));
  check('message: textarea name=message maxlength=5000 required', /<textarea id="c-msg" name="message"[^>]*maxlength="5000" required/.test(main));
  const hp = between(main, /<div class="hp" aria-hidden="true">[\s\S]*?<\/div>/);
  check('honeypot inside aria-hidden .hp', /name="website"/.test(hp) && /tabindex="-1"/.test(hp) && /autocomplete="off"/.test(hp) && /Leave this field empty/.test(hp));
  check('.hp moved off-screen, not display:none', /\.hp\s*\{[^}]*left:\s*-10000px/.test(read('css/site.css')) && !/\.hp\s*\{[^}]*display:\s*none/.test(read('css/site.css')));
  check('support.js: const SEND = true;', exists('js/support.js') && /const SEND = true;/.test(read('js/support.js')));
  check('support.js: the temporary sender', exists('js/support.js') && read('js/support.js').includes("const ENDPOINT = 'https://bloomdays-contact.evdiag.workers.dev/api/contact';"));
  check('support.js loaded as a module', /<script type="module" src="\/js\/support\.js"><\/script>/.test(h));
  check('noscript line with the email', /<noscript>[\s\S]*support@bloomdays\.family[\s\S]*<\/noscript>/.test(main));
  check('nine common questions', (main.match(/<details/g) || []).length === 9);
  check('the privacy line under the form', /We use your email only to answer you\./.test(main) && main.includes('href="/privacy.html#support"'));
  check('Send message button', /<button class="btn" type="submit">Send message<\/button>/.test(main));
  check('the badges once (Rate Bloom)', (main.match(/data-store="appStore"/g) || []).length === 1);
});

// ── §8 the form in a browser
SECTIONS.push(async () => {
  if (!browserSection(8, 'the form in a browser')) return;
  if (!exists('support.html')) { check('support.html exists', false); return; }
  const fill = async (p, d) => {
    if (d.email != null) await p.fill('#c-email', d.email);
    if (d.type) await p.check(`input[name="type"][value="${d.type}"]`);
    if (d.message != null) await p.fill('#c-msg', d.message);
    if (d.website) await p.evaluate(v => { document.getElementById('c-web').value = v; }, d.website);
  };
  const GOOD = { email: 'anna@example.com', type: 'bug', message: 'The kick counter stopped at 9 and did not save.' };
  const count = p => { const n = { v: 0, bodies: [] }; p.on('request', r => { if (r.url().endsWith('/api/contact')) { n.v++; n.bodies.push(r.postData()); } }); return n; };
  await withPage('/support.html', {}, async p => {
    const n = count(p);
    await p.click('#contact button[type="submit"]');
    check('empty Send: three errors', (await p.locator('#contact [aria-invalid="true"], #contact fieldset[aria-invalid="true"]').count()) === 3);
    check('empty Send: focus on the email', await p.evaluate(() => document.activeElement && document.activeElement.id === 'c-email'));
    check('empty Send: the email message', (await p.locator('#c-email-err').textContent()).trim() === 'Please enter your email.');
    check('empty Send: the type message', (await p.locator('#c-type-err').textContent()).trim() === 'Please choose what it is about.');
    check('empty Send: no request', n.v === 0);
    await fill(p, { email: 'x@y', type: 'idea', message: 'too short' });
    await p.click('#contact button[type="submit"]');
    check('x@y → That email doesn\'t look right.', (await p.locator('#c-email-err').textContent()).trim() === "That email doesn't look right.");
    check('9 characters → Please write a little more.', (await p.locator('#c-msg-err').textContent()).trim() === 'Please write a little more.');
    check('a fixed field loses its error', (await p.locator('#c-type-err').textContent()).trim() === '');
    await p.fill('#c-msg', 'x'.repeat(5100));
    check('5,001 cannot be typed', (await p.inputValue('#c-msg')).length === 5000);
    check('the count shows near the limit', /5,000 of 5,000/.test(await p.locator('#c-msg-count').textContent()));
    await p.check('input[name="type"][value="bug"]');
    check('bug shows the hint', await p.locator('#c-msg-hint').isVisible());
    await p.check('input[name="type"][value="idea"]');
    check('idea hides the hint', !(await p.locator('#c-msg-hint').isVisible()));
    await p.focus('input[name="type"][value="idea"]'); await p.keyboard.press('ArrowRight');
    check('arrow keys move between the types', await p.evaluate(() => document.querySelector('input[name="type"]:checked').value === 'feature'));
  });
  await withPage('/support.html', { permissions: ['clipboard-read', 'clipboard-write'], before: async p => {
    await p.clock.install({ time: new Date('2026-11-13T10:00:00Z') });
    await p.route('**/api/contact', r => r.fulfill({ status: 500, body: 'x' }));
  } }, async p => {
    const n = count(p);
    await fill(p, GOOD); await p.clock.runFor(4000);
    await p.click('#contact button[type="submit"]'); await p.clock.runFor(500); await p.waitForTimeout(200);
    check('a failed send: one request', n.v === 1);
    check('a failed send: the copy-and-email box shows', await p.locator('#c-fallback').isVisible());
    check('a failed send: the box names the email', /support@bloomdays\.family/.test(await p.locator('#c-fallback').textContent()));
    check('a failed send: the box does not say the form is not sending yet', !/isn't sending yet/.test(await p.locator('#c-fallback').textContent()));
    const want = await p.evaluate(d => window.BloomSupport.fallbackText({ ...d, website: '', ms: 0, page: 'support' }), GOOD);
    check('a failed send: the text to copy is fallbackText', (await p.inputValue('#c-fallback textarea')) === want);
    check('a failed send: the fields are still filled', (await p.inputValue('#c-msg')) === GOOD.message && (await p.inputValue('#c-email')) === GOOD.email);
    await p.click('#c-fallback [data-copy-msg]'); await p.waitForTimeout(100);
    check('Copy message copies it', (await p.evaluate(() => navigator.clipboard.readText())) === want);
    const long = await p.evaluate(() => {
      const d = { email: 'a@b.co', type: 'feedback', message: 'y'.repeat(1600) };
      return { href: window.BloomSupport.mailtoHref(d), text: window.BloomSupport.fallbackText(d) };
    });
    const body = decodeURIComponent(long.href.split('body=')[1] || '');
    check('mailto body cut at 1,500 + the note (Review Focus 3)', body.startsWith('y'.repeat(1500)) && !body.startsWith('y'.repeat(1501)) && body.includes('(the full message is copied — paste it here)'));
    check('mailto subject Bloom · Feedback', decodeURIComponent(long.href.split('subject=')[1].split('&')[0]) === 'Bloom · Feedback');
    check('fallbackText keeps all 1,600', long.text.includes('y'.repeat(1600)));
    const emo = await p.evaluate(() => { try { return window.BloomSupport.mailtoHref({ email: 'a@b.co', type: 'bug', message: 'x'.repeat(1499) + '🌸' + 'tail' }); } catch (e) { return 'THREW ' + e.message; } });
    check('an emoji at the 1,500 cut does not break the mailto', !emo.startsWith('THREW') && decodeURIComponent(emo.split('body=')[1]).startsWith('x'.repeat(1499)), emo.slice(0, 40));
  });
  // sending (the sender's answer is played by the test)
  const sendPage = async (answer, fn) => withPage('/support.html', { before: async p => {
    await p.clock.install({ time: new Date('2026-11-13T10:00:00Z') });
    await p.route('**/api/contact', answer);
  } }, fn);
  await sendPage(async r => { await new Promise(ok => setTimeout(ok, 400)); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }, async p => {
    const n = count(p);
    await fill(p, GOOD);
    await p.clock.runFor(4000);
    await p.click('#contact button[type="submit"]');
    await p.click('#contact button[type="submit"]', { force: true, timeout: 300 }).catch(() => {});
    await p.press('#c-email', 'Enter', { timeout: 300 }).catch(() => {});
    await p.evaluate(() => { const f = document.getElementById('contact'); if (f) f.requestSubmit(); });
    await p.waitForTimeout(700); await p.clock.runFor(500); await p.waitForTimeout(200);
    check('one request only (Review Focus 2)', n.v === 1, String(n.v));
    let b = {}; try { b = JSON.parse(n.bodies[0]); } catch {}
    check('the body has exactly the six keys', JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['email', 'message', 'ms', 'page', 'type', 'website']), JSON.stringify(Object.keys(b)));
    check('page = support, type = bug, ms ≥ 3000', b.page === 'support' && b.type === 'bug' && b.ms >= 3000, JSON.stringify(b));
    check('thank-you names her email', /Thank you — your message is on its way\. We'll answer at anna@example\.com\./.test(await p.locator('main').textContent()));
  });
  for (const [label, answer] of [['500', r => r.fulfill({ status: 500, body: 'x' })], ['{ok:false}', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"x"}' })]]) {
    await sendPage(answer, async p => {
      await fill(p, GOOD); await p.clock.runFor(4000);
      await p.click('#contact button[type="submit"]'); await p.clock.runFor(500); await p.waitForTimeout(200);
      check(`${label} → the fail line`, /It didn't go through\. Please try again, or write to support@bloomdays\.family\./.test(await p.locator('#contact').textContent()));
      check(`${label} → the copy-and-email box`, await p.locator('#c-fallback').isVisible());
      check(`${label} → fields kept, Send enabled`, (await p.inputValue('#c-msg')) === GOOD.message && await p.locator('#contact button[type="submit"]').isEnabled());
    });
  }
  await sendPage(() => {}, async p => {      // never answers
    await fill(p, GOOD); await p.clock.runFor(4000);
    await p.click('#contact button[type="submit"]');
    check('while sending: the button says Sending… and is disabled', (await p.locator('#contact button[type="submit"]').textContent()).trim() === 'Sending…' && !(await p.locator('#contact button[type="submit"]').isEnabled()));
    await p.clock.runFor(15500); await p.waitForTimeout(200);
    check('no answer in 15 s → the fail line', /It didn't go through/.test(await p.locator('#contact').textContent()));
  });
  for (const [label, d, wait] of [['a filled honeypot', { ...GOOD, website: 'http://spam' }, 4000], ['under 3 s on the page', GOOD, 500]]) {
    await sendPage(r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }), async p => {
      const n = count(p);
      await fill(p, d); await p.clock.runFor(wait);
      await p.click('#contact button[type="submit"]'); await p.clock.runFor(300); await p.waitForTimeout(150);
      check(`${label} → the thank-you`, /Thank you — your message is on its way/.test(await p.locator('main').textContent()));
      check(`${label} → no request`, n.v === 0);
    });
  }
  await withPage('/support.html', { js: false }, async p => {
    check('JS off: the noscript line shows (Review Focus 1)', /The form needs JavaScript — or write to support@bloomdays\.family\./.test(await p.locator('main').textContent()));
    check('JS off: the form is hidden (it cannot send without its script)', !(await p.locator('#contact').isVisible()));
  });
  check('no test switch left in support.js', exists('js/support.js') && !/send=1|location\.hostname/.test(read('js/support.js')));
});

// ── §9 the privacy policy
SECTIONS.push(async () => {
  if (!section(9, 'privacy policy')) return;
  const h = pageText('privacy.html'), main = between(h, /<main[\s\S]*?<\/main>/), txt = textOf(main);
  const sec = id => textOf(between(main, new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`)));
  for (const w of ['Roman Franta', 'Singapore', 'support@bloomdays.family', 'Anthropic', 'OpenAI', 'Apple', 'Google', 'RevenueCat', 'Cloudflare', 'Resend'])
    check(`privacy names ${w}`, txt.includes(w));
  for (const a of ['who', 'phone', 'leaves', 'ai', 'backup', 'purchases', 'support', 'labels', 'choices', 'security', 'health-data', 'children', 'rights', 'changes', 'contact'])
    check(`#${a} exists`, new RegExp(`<section[^>]*id="${a}"`).test(main));
  const labels = sec('labels');
  for (const l of ['Name', 'Health', 'Sensitive Info', 'Audio Data', 'Other User Content', 'User ID', 'Purchase History']) check(`#labels lists ${l}`, labels.includes(l));
  check('#labels: linked to you, app functionality, not used to track you', /linked to you/i.test(labels) && /app functionality/i.test(labels) && /not used to track you/i.test(labels));
  check('#backup: off unless she turns it on', /off unless you turn it on/i.test(sec('backup')));
  check('no claim that nothing leaves the phone', !/nothing (ever )?leaves|never leaves your (phone|device)/i.test(txt));
  check('#ai: the providers\' terms with a date', /\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d\b/.test(sec('ai')));
  check('#ai: a call goes straight from the phone to OpenAI', /straight from your phone to OpenAI/.test(sec('ai')));
  check('Last updated and Version 2.0 at the top', /Last updated: [A-Z][a-z]+ \d{1,2}, 2026 · Version 2\.0/.test(between(main, /<section[\s\S]*?<\/section>/)));
  check('#children: under 16', /under 16/.test(sec('children')));
  check('#health-data names Washington', /Washington/.test(sec('health-data')));
  check('#choices: 30 days', /30 days/.test(sec('choices')));
  const leaves = sec('leaves');
  check('#leaves: during a call, what was just said goes to Anthropic every few seconds', /every few seconds/.test(leaves) && /Anthropic/.test(leaves));
  check('#leaves: voices recognised by name through Anthropic', /recogni[sz]e/.test(leaves));
  check('#leaves: dictation by Apple\'s or Google\'s speech recognition', /speech recognition/i.test(leaves));
  check('#leaves: counters by IP address to limit abuse', /limit abuse/.test(leaves));
  check('privacy describes Health Connect', /Health Connect/.test(txt));
  const hd = sec('health-data');
  for (const w of ['sex', 'temperature', 'ovulation test', 'medicines', 'pregnancy loss', 'due date']) check(`#health-data names ${w}`, hd.includes(w));
  check('#backup: facts, past moments and open threads — not the notes', /past moments/.test(sec('backup')) && /never your logs, your chats or the dated conversation notes/.test(sec('backup')) && (sec('backup').match(/notes/g) || []).length === 1);
  check('#support: the form is delivered by Resend through Bloom\'s small sender on Cloudflare', /Resend/.test(sec('support')) && /Cloudflare/.test(sec('support')) && !/Until the form sends/.test(sec('support')));
  check('#security: the backup is not end-to-end… said honestly', /not encrypted so that only you can read it/i.test(sec('security')));
});

// ── §10 the terms
SECTIONS.push(async () => {
  if (!section(10, 'terms')) return;
  check('terms.html exists', exists('terms.html'));
  if (!exists('terms.html')) return;
  const main = between(pageText('terms.html'), /<main[\s\S]*?<\/main>/), txt = textOf(main);
  const sec = id => textOf(between(main, new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`)));
  for (const a of ['who', 'what', 'ai', 'pro', 'family', 'use', 'yours', 'liability', 'stores', 'law', 'changes', 'contact'])
    check(`#${a} exists`, new RegExp(`<section[^>]*id="${a}"`).test(main));
  for (const w of ['Roman Franta', 'Singapore', 'support@bloomdays.family']) check(`terms name ${w}`, txt.includes(w));
  check('#what: not birth control, must not be used to prevent pregnancy', /not birth control/.test(sec('what')) && /must not be used to prevent pregnancy/.test(sec('what')));
  check('#pro: no subscriptions and nothing else to buy', /There are no subscriptions and nothing else to buy in Bloom today\./.test(sec('pro')));
  check('#pro: no credit packs, no "Always Bloom"', !/buy credits|credit pack|always bloom/i.test(txt));
  check('#pro: "subscription" only as "no subscriptions"', !/subscription/i.test(sec('pro').replace(/no subscriptions/gi, '')));
  check('#stores: Apple\'s standard EULA linked', main.includes('href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"'));
  check('#law: the laws of Singapore', /governed by the laws of Singapore/.test(sec('law')));
  check('#ai links /privacy.html#ai', main.includes('href="/privacy.html#ai"'));
  check('Last updated at the top', /Last updated: [A-Z][a-z]+ \d{1,2}, 2026/.test(txt));
});

// ── §11 phones: widths, tap targets, contrast, text size, the menu, larger text
// ── §2 (languages) links, the frame within a language, the switch
SECTIONS.push(async () => {
  if (!section(2, 'links and the frame — the other languages')) return;
  const B = require(path.join(ROOT, 'build.js'));
  for (const l of XX_LANGS) {
    const heads = [], foots = [];
    for (const f of B.pagesFor(l)) {
      if (!exists(f)) { check(`${f} exists`, false); continue; }
      const h = pageText(f);
      for (const r of refsOf(h)) {
        const u = r.url;
        if (!u || u.startsWith('mailto:') || isExternal(u)) continue;
        if (u.startsWith('#')) { check(`${f}: anchor ${u} exists`, idsOf(h).has(u.slice(1))); continue; }
        const target = resolveFile(ROOT, u.startsWith('/') ? u : '/' + u);
        check(`${f}: ${r.attr}="${u}" resolves`, !!target);
        const frag = u.split('#')[1];
        if (target && frag && target.endsWith('.html')) check(`${f}: ${u} — #${frag} exists`, idsOf(fs.readFileSync(target, 'utf8')).has(frag));
      }
      heads.push(between(h, /<header class="site-head"[\s\S]*?<\/header>/).replace(/ aria-current="page"/g, '').replace(/\s*<nav class="lang-switch"[\s\S]*?<\/nav>/, ''));
      foots.push(between(h, /<footer class="site-foot"[\s\S]*?<\/footer>/));
      const page = f.split('/')[1], key = page.replace('.html', '');
      const canon = `https://bloomdays.family/${l}/${page === 'index.html' ? '' : page}`;
      check(`${f}: canonical ${canon}`, h.includes(`<link rel="canonical" href="${canon}">`));
      check(`${f}: og:url = canonical`, h.includes(`<meta property="og:url" content="${canon}">`));
      check(`${f}: <title> in her language`, h.includes(`<title>${B.expand(`{{page.${key}.title}}`, l, {})}</title>`) && !h.includes(`<title>${B.expand(`{{page.${key}.title}}`, 'en', {})}</title>`));
      check(`${f}: nav links stay in her language`, [...between(h, /<nav id="site-nav"[\s\S]*?<\/nav>/).matchAll(/href="([^"]+)"/g)].every(m => m[1].startsWith(`/${l}/`)));
      check(`${f}: the brand goes to her Home`, h.includes(`<a class="brand" href="/${l}/index.html">`));
      // the switch: her language marked; the same page where it exists in the other language, else that language's Home
      const L = [...between(h, /<nav class="lang-switch"[\s\S]*?<\/nav>/).matchAll(/<a href="([^"]+)" hreflang="([^"]+)" lang="[^"]+"( aria-current="true")?>/g)];
      const want = ['en', ...XX_LANGS].map(x => page === 'privacy.html' ? (x === 'en' ? '/index.html' : `/${x}/privacy.html`) : (x === 'en' ? '/' + page : `/${x}/${page}`));
      check(`${f}: the switch's targets`, JSON.stringify(L.map(m => m[1])) === JSON.stringify(want), L.map(m => m[1]).join(' '));
      check(`${f}: the switch marks ${l}`, L.filter(m => m[3]).length === 1 && L.find(m => m[3])[2] === B.HTML_LANG[l]);
      const alt = [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => m[1]);
      check(`${f}: hreflang alternates`, page === 'privacy.html' ? JSON.stringify(alt) === '["cs","ru","th","zh-Hans"]' : JSON.stringify(alt) === '["en","cs","ru","th","zh-Hans","x-default"]', alt.join(' '));
    }
    check(`${l}: header identical on its pages`, heads.length === 3 && heads.every(x => x && x === heads[0]));
    check(`${l}: footer identical on its pages`, foots.length === 3 && foots.every(x => x && x === foots[0]));
  }
});

// ── §2 (switch in a browser) the switch keeps the part of the page she is on (final review, Review Focus 4)
SECTIONS.push(async () => {
  if (!browserSection(2, 'the switch keeps her place')) return;
  for (const [from, link, want] of [['/index.html#ask', 'CS', '/cs/index.html#ask'], ['/zh/index.html#family', 'EN', '/index.html#family'], ['/cs/support.html#faq', 'RU', '/ru/support.html#faq'], ['/cs/privacy.html#choices', 'EN', '/index.html']]) {
    await withPage(from, {}, async p => {
      await Promise.all([p.waitForEvent('framenavigated'), p.evaluate(t => [...document.querySelectorAll('.lang-switch a')].find(a => a.textContent === t).click(), link)]);
      await p.waitForLoadState('load');
      const u = new URL(p.url());
      check(`${from} → ${link} lands on ${want}`, u.pathname + u.hash === want, u.pathname + u.hash);
    });
  }
});

// ── §8 (languages) the form in her language, in a browser
SECTIONS.push(async () => {
  if (!browserSection(8, 'the form in a browser — the other languages')) return;
  const B = require(path.join(ROOT, 'build.js'));
  const GOOD = { email: 'anna@example.com', type: 'bug', message: 'Počítadlo pohybů se zastavilo na 9. Счётчик. ตัวนับ. 计数器。' };
  for (const l of XX_LANGS) {
    const url = `/${l}/support.html`, W = B.words(l);
    const M = {}; for (const k of Object.keys(W)) if (k.startsWith('msg.')) M[k.slice(4)] = B.expand(`{{${k}}}`, l, {}).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const count = p => { const n = { v: 0, bodies: [] }; p.on('request', r => { if (r.url().endsWith('/api/contact')) { n.v++; n.bodies.push(r.postData()); } }); return n; };
    await withPage(url, {}, async p => {
      const labels = await p.locator('#contact label.chip').evaluateAll(ls => ls.map(x => [x.querySelector('input').value, x.textContent.trim()]));
      check(`${l}: the five types, values as in English, labels in her language`, JSON.stringify(labels) === JSON.stringify(['bug', 'idea', 'feature', 'feedback', 'other'].map(v => [v, W['type.' + v]])), JSON.stringify(labels));
      await p.click('#contact button[type="submit"]');
      check(`${l}: empty Send → her words`, (await p.locator('#c-email-err').textContent()).trim() === M.email && (await p.locator('#c-type-err').textContent()).trim() === M.type);
      await p.fill('#c-email', 'x@y'); await p.check('input[name="type"][value="idea"]'); await p.fill('#c-msg', 'krátké');
      await p.click('#contact button[type="submit"]');
      check(`${l}: x@y and a short message → her words`, (await p.locator('#c-email-err').textContent()).trim() === M.emailBad && (await p.locator('#c-msg-err').textContent()).trim() === M.short);
      await p.fill('#c-msg', 'x'.repeat(4600));
      check(`${l}: the count in her words`, (await p.locator('#c-msg-count').textContent()).includes(M.count.split('{n}')[1].split('{max}')[0].trim() || '/'));
    });
    await withPage(url, { before: async p => { await p.clock.install({ time: new Date('2026-11-13T10:00:00Z') });
      await p.route('**/api/contact', async r => { await new Promise(ok => setTimeout(ok, 300)); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }); } }, async p => {
      const n = count(p);
      await p.fill('#c-email', GOOD.email); await p.check('input[name="type"][value="bug"]'); await p.fill('#c-msg', GOOD.message);
      await p.clock.runFor(4000);
      await p.click('#contact button[type="submit"]');
      await p.evaluate(() => { const f = document.getElementById('contact'); if (f) f.requestSubmit(); });
      await p.waitForTimeout(600); await p.clock.runFor(400); await p.waitForTimeout(150);
      check(`${l}: one request on a double tap`, n.v === 1, String(n.v));
      let b = {}; try { b = JSON.parse(n.bodies[0]); } catch {}
      check(`${l}: the body has exactly the six keys, type bug`, JSON.stringify(Object.keys(b).sort()) === '["email","message","ms","page","type","website"]' && b.type === 'bug' && b.message === GOOD.message);
      check(`${l}: the thank-you in her words`, (await p.locator('main').textContent()).includes(M.thanks.replace('{email}', GOOD.email)));
    });
    await withPage(url, { before: async p => { await p.clock.install({ time: new Date('2026-11-13T10:00:00Z') }); await p.route('**/api/contact', r => r.fulfill({ status: 500, body: 'x' })); } }, async p => {
      await p.fill('#c-email', GOOD.email); await p.check('input[name="type"][value="feedback"]'); await p.fill('#c-msg', GOOD.message);
      await p.clock.runFor(4000); await p.click('#contact button[type="submit"]'); await p.clock.runFor(400); await p.waitForTimeout(200);
      check(`${l}: a failed send → her fail line`, (await p.locator('#c-status').textContent()).trim() === M.fail.replace('{support}', 'support@bloomdays.family'));
      check(`${l}: …and the copy-and-email box, its lead in her words`, await p.locator('#c-fallback').isVisible() && (await p.locator('#c-fallback [data-fb-lead]').textContent()).trim() === M.didnt);
      const sub = decodeURIComponent((await p.locator('#c-fallback [data-mailto]').getAttribute('href')).split('subject=')[1].split('&')[0]);
      check(`${l}: the mailto subject stays English (Roman reads it)`, sub === 'Bloom · Feedback', sub);
    });
    await withPage(url, { js: false }, async p => {
      const t = (await p.locator('main').textContent()).replace(/\s+/g, ' ');
      check(`${l}: JS off — the noscript line in her language`, t.includes(B.expand('{{{sup.noscript}}}', l, {}).replace(/<[^>]+>/g, '')));
      check(`${l}: JS off — the form hidden`, !(await p.locator('#contact').isVisible()));
    });
    for (const pg of ['index.html', 'privacy.html']) await withPage(`/${l}/${pg}`, { js: false }, async p => {
      check(`${l}/${pg}: JS off — readable, in her language`, await p.locator('main h1, main h2').first().isVisible() && await p.evaluate(() => document.documentElement.lang) === B.HTML_LANG[l]);
    });
  }
});

// ── §4 (languages) the real screens in her language
SECTIONS.push(async () => {
  if (!section(4, 'home — the screens in each language')) return;
  for (const l of ['cs', 'ru', 'th', 'zh']) {
    const f = `${l}/index.html`;
    if (!exists(f)) { check(`${f} exists`, false); continue; }
    const h = read(f), en = read('index.html');
    const shots = [...h.matchAll(/<figure class="phone" data-screen="([^"]+)"><img src="([^"]+)" width="390" height="844" alt="([^"]+)"/g)].map(m => ({ name: m[1], src: m[2], alt: m[3] }));
    const enAlts = Object.fromEntries([...en.matchAll(/data-screen="([^"]+)"><img src="[^"]+" width="390" height="844" alt="([^"]+)"/g)].map(m => [m[1], m[2]]));
    check(`${f}: five screens`, shots.length === 5, String(shots.length));
    for (const s of shots) {
      check(`${f}: ${s.name} from img/screens/${l}/`, s.src === `/img/screens/${l}/${s.name}.webp`, s.src);
      check(`${f}: ${s.name}'s alt in her language`, s.alt !== enAlts[s.name]);
      const p = s.src.slice(1);
      if (!exists(p)) { check(`${p} exists`, false); continue; }
      const b = readBuf(p), dim = webpSize(b);
      check(`${p}: 780 × 1688`, dim && dim.w === 780 && dim.h === 1688, JSON.stringify(dim));
      check(`${p}: ≤ 180 KB`, b.length <= 180 * 1024, String(b.length));
    }
  }
});

// ── §6 (languages) the not-found and the invite in her language
SECTIONS.push(async () => {
  if (!browserSection(6, '404 and the invite — her language')) return;
  const block = (() => { const m = read('404.html').match(/<script type="application\/json" id="i18n-404">([\s\S]*?)<\/script>/); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } })();
  check('404.html carries the words of all five languages', !!block && JSON.stringify(Object.keys(block)) === '["en","cs","ru","th","zh"]', block ? Object.keys(block).join(' ') : 'no block');
  if (!block) return;
  const NEED = ['title', 'nf.title', 'nf.lede', 'nf.home', 'nf.haveApp', 'inv.title', 'inv.lede', 'inv.copy', 'inv.copied', 'inv.copyFail', 'inv.steps', 'inv.docTitle'];
  for (const l of Object.keys(block)) check(`404 words ${l}: every key`, NEED.every(k => typeof block[l][k] === 'string' && block[l][k].trim()), NEED.filter(k => !(block[l][k] || '').trim()).join(' '));
  const H = { en: 'en', cs: 'cs', ru: 'ru', th: 'th', zh: 'zh-Hans' };
  const cases = [['cs-CZ', 'cs'], ['ru-RU', 'ru'], ['th-TH', 'th'], ['zh-CN', 'zh'], ['zh-TW', 'zh'], ['zh-HK', 'zh'], ['de-DE', 'en'], ['en-GB', 'en']];
  for (const [locale, l] of cases) {
    const W = block[l];
    if (!W) { check(`${locale}: words for ${l} exist`, false); continue; }
    await withPage('/r/ABC123', { ctx: { locale } }, async page => {
      check(`${locale} invite → ${l}: the heading`, (await page.locator('#invite h1').textContent()).trim() === W['inv.title'], await page.locator('#invite h1').textContent());
      check(`${locale} invite → ${l}: the lede and the steps`, (await page.locator('#invite .lede').textContent()).trim() === W['inv.lede'] && (await page.locator('#invite [data-t="inv.steps"]').textContent()).trim() === W['inv.steps']);
      check(`${locale} invite → ${l}: <html lang>`, await page.evaluate(() => document.documentElement.lang) === H[l]);
      check(`${locale} invite → ${l}: the tab title`, await page.title() === W['inv.docTitle']);
      check(`${locale} invite → ${l}: the code and Play link still work`, (await page.locator('[data-code]').first().textContent()).trim() === 'ABC123'
        && /referrer=code%3DABC123/.test(await page.locator('#invite [data-store="googlePlay"]').getAttribute('href') || ''));
      if (l !== 'en') check(`${locale}: words differ from English`, W['inv.title'] !== block.en['inv.title'] && W['nf.title'] !== block.en['nf.title']);
    });
    await withPage('/nothing', { ctx: { locale } }, async page => {
      check(`${locale} not-found → ${l}: the heading`, (await page.locator('#notfound h1').textContent()).trim() === W['nf.title']);
      check(`${locale} not-found → ${l}: home is ${l === 'en' ? '/index.html' : '/' + l + '/index.html'}`, await page.locator('#notfound a.btn').getAttribute('href') === (l === 'en' ? '/index.html' : `/${l}/index.html`)
        && (await page.locator('#notfound a.btn').textContent()).trim() === W['nf.home']);
      check(`${locale} not-found → ${l}: the tab title`, await page.title() === W.title);
    });
  }
  await withPage('/r/ABC123', { js: false, ctx: { locale: 'cs-CZ' } }, async page => {
    check('JS off, Czech phone: the not-found in English', (await page.locator('#notfound h1').textContent()).trim() === "This page isn't here." && await page.locator('#notfound h1').isVisible());
  });
  await withPage('/nothing', {}, async page => {
    const r = await page.evaluate(() => { const P = window.BloomSite && window.BloomSite.pickLang; if (!P) return null;
      return [P(['de-DE', 'cs']), P(['en-US', 'cs']), P(['zh-Hant-TW']), P(['ZH-hk']), P(['th']), P([]), P(['pt-BR', 'fr'])]; });
    check('pickLang: her languages in her order; zh-* → zh; English otherwise', JSON.stringify(r) === '["cs","en","zh","zh","th","en","en"]', JSON.stringify(r));
  });
  await withPage('/r/ABC123', { ctx: { locale: 'cs-CZ' }, permissions: ['clipboard-read', 'clipboard-write'] }, async page => {
    await page.locator('#invite [data-copy]').click();
    await page.waitForTimeout(150);
    check('cs: the Copy button then reads its Copied', (await page.locator('#invite [data-copy]').textContent()).trim() === (block.cs ? block.cs['inv.copied'] : '?'));
  });
});

// ── §8 (words) the form takes its words from the page
SECTIONS.push(async () => {
  if (!section(8, 'the form — its words from the page')) return;
  const h = read('support.html');
  const m = h.match(/<form id="contact"[^>]*\sdata-msg="([^"]*)"/);
  let M = null; try { M = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : null; } catch {}
  const KEYS = ['email', 'emailBad', 'type', 'short', 'long', 'sending', 'send', 'thanks', 'fail', 'notYet', 'didnt', 'copied', 'copyFail', 'count', 'cut'];
  check('support.html: the form carries its words (data-msg, JSON)', !!M, m ? m[1].slice(0, 80) : 'no data-msg');
  if (M) check('data-msg has every word', KEYS.every(k => typeof M[k] === 'string' && M[k]), KEYS.filter(k => !M[k]).join(' '));
  if (M) check('the English words are today\'s', M.email === 'Please enter your email.' && M.thanks === "Thank you — your message is on its way. We'll answer at {email}."
    && M.fail === "It didn't go through. Please try again, or write to {support}." && M.send === 'Send message' && M.count === '{n} of {max}');
  const js = read('js/support.js');
  for (const w of ['Please enter your email', "doesn't look right", 'Please choose', 'write a little more', 'Thank you', "didn't go through", 'Sending…', 'Select and copy', "isn't sending"])
    check(`support.js has no English word "${w}" (it reads them from the page)`, !js.includes(w));
  check('support.js still names the types in English for the email (LABELS)', /const LABELS = \{ bug: 'Report a bug'/.test(js));
  const sj = read('js/site.js');
  for (const w of ['Copied', 'Copy failed', 'A little gift from a friend']) check(`site.js has no English word "${w}"`, !sj.includes(w));
});

// ── §12 the page writer
SECTIONS.push(async () => {
  if (!section(12, 'the page writer')) return;
  check('build.js exists', exists('build.js'));
  if (!exists('build.js')) return;
  const { spawnSync } = require('node:child_process');
  const os = require('node:os');
  const B = require(path.join(ROOT, 'build.js'));
  const r0 = spawnSync(process.execPath, ['build.js', '--check'], { cwd: ROOT, encoding: 'utf8' });
  check('build.js --check passes', r0.status === 0, (r0.stdout + r0.stderr).trim().split('\n').slice(0, 5).join(' | '));
  // a page edited by hand is caught, naming the file and the way to fix it
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-site-'));
  try {
    fs.cpSync(ROOT, tmp, { recursive: true, filter: s => !/[\\/](\.git|\.superpowers|node_modules)([\\/]|$)/.test(s) });
    const victim = B.LANGS.filter(B.hasLang).length > 1 ? 'cs/index.html' : 'index.html';
    const vf = path.join(tmp, victim);
    const before = fs.readFileSync(vf, 'utf8');
    fs.writeFileSync(vf, before.replace(/(<h2>[^<]{2})/, '$1x'));
    const r1 = spawnSync(process.execPath, ['build.js', '--check'], { cwd: tmp, encoding: 'utf8' });
    check(`a hand edit of ${victim} fails --check, naming the file and "edit src/"`,
      r1.status === 1 && r1.stdout.includes(`${victim} differs from what build.js writes — edit src/ and run node build.js`), r1.stdout.trim());
    fs.writeFileSync(vf, before);
    fs.rmSync(path.join(tmp, victim));
    const r2 = spawnSync(process.execPath, ['build.js', '--check'], { cwd: tmp, encoding: 'utf8' });
    check(`a missing ${victim} fails --check`, r2.status === 1 && r2.stdout.includes(victim), r2.stdout.trim());
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  check('LANGS', JSON.stringify(B.LANGS) === '["en","cs","ru","th","zh"]');
  check('HTML_LANG', JSON.stringify(B.HTML_LANG) === '{"en":"en","cs":"cs","ru":"ru","th":"th","zh":"zh-Hans"}');
  check('pagesFor(en)', JSON.stringify(B.pagesFor('en')) === '["index.html","support.html","privacy.html","terms.html","404.html"]');
  check('pagesFor(cs)', JSON.stringify(B.pagesFor('cs')) === '["cs/index.html","cs/support.html","cs/privacy.html"]');
  for (const lang of B.LANGS.filter(B.hasLang)) for (const page of B.pagesFor(lang)) {
    const keys = B.keysUsed(lang, page);
    check(`${page}: keysUsed is not empty`, keys.length > 0);
    for (const k of keys) check(`${lang}: key ${k} has a value`, B.has(lang, k));
    check(`${page}: render(${lang}) = the file`, exists(page) && B.render(lang, page) === read(page));
  }
  // template rules
  check('a missing key stops the build with its name', (() => { try { B.expand('{{no.such.key}}', 'en', {}); return false; } catch (e) { return /missing key "no\.such\.key" for en/.test(e.message); } })());
  check('a missing app word stops the build with its name', (() => { try { B.expand('{{app:no.such}}', 'en', {}); return false; } catch (e) { return /missing app word "no\.such" for en/.test(e.message); } })());
  check('{{key}} is escaped, {{{key}}} is not', B.expand('{{x}}|{{{x}}}', 'en', {}, { x: 'a & <b>' }) === 'a &amp; &lt;b&gt;|a & <b>');
  // the switch
  const sw = f => between(read(f), /<nav class="lang-switch"[\s\S]*?<\/nav>/);
  const links = f => [...sw(f).matchAll(/<a href="([^"]+)" hreflang="([^"]+)" lang="([^"]+)"( aria-current="true")?>([^<]+)<\/a>/g)].map(m => ({ href: m[1], hreflang: m[2], lang: m[3], cur: !!m[4], text: m[5] }));
  const want = { 'index.html': ['/index.html', '/cs/index.html', '/ru/index.html', '/th/index.html', '/zh/index.html'],
    'support.html': ['/support.html', '/cs/support.html', '/ru/support.html', '/th/support.html', '/zh/support.html'],
    'privacy.html': ['/privacy.html', '/cs/index.html', '/ru/index.html', '/th/index.html', '/zh/index.html'],
    'terms.html': ['/terms.html', '/cs/index.html', '/ru/index.html', '/th/index.html', '/zh/index.html'] };
  for (const [f, hrefs] of Object.entries(want)) {
    const L = links(f);
    check(`${f}: the switch has EN CS RU TH 中文`, L.map(l => l.text).join(' ') === 'EN CS RU TH 中文', L.map(l => l.text).join(' '));
    check(`${f}: the switch's targets`, JSON.stringify(L.map(l => l.href)) === JSON.stringify(hrefs), L.map(l => l.href).join(' '));
    check(`${f}: EN is marked current, only EN`, L.length === 5 && L[0].cur && L.slice(1).every(l => !l.cur));
    check(`${f}: hreflang and lang on each`, JSON.stringify(L.map(l => l.hreflang)) === '["en","cs","ru","th","zh-Hans"]' && L.every(l => l.lang === l.hreflang));
  }
  check('404.html: no switch', !/class="lang-switch"/.test(read('404.html')));
  for (const f of ['index.html', 'support.html']) {
    const h = read(f), u = f === 'index.html' ? '' : f;
    const alt = [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => m[1] + '=' + m[2]);
    check(`${f}: hreflang alternates`, JSON.stringify(alt) === JSON.stringify(['en=https://bloomdays.family/' + u, 'cs=https://bloomdays.family/cs/' + u, 'ru=https://bloomdays.family/ru/' + u,
      'th=https://bloomdays.family/th/' + u, 'zh-Hans=https://bloomdays.family/zh/' + u, 'x-default=https://bloomdays.family/' + u]), alt.join(' '));
  }
  for (const f of ['privacy.html', 'terms.html', '404.html']) check(`${f}: no hreflang alternates`, !/rel="alternate"/.test(read(f)));
});

// ── §13 the four other languages: words, the summary, fonts
SECTIONS.push(async () => {
  if (!section(13, 'the other languages')) return;
  if (!exists('build.js')) { check('build.js exists', false); return; }
  const B = require(path.join(ROOT, 'build.js'));
  const XX = ['cs', 'ru', 'th', 'zh'];
  const SAME_OK = new Set(['badge.as.w', 'badge.gp.w', 'msg.send']);
  const en = B.words('en');
  const BAN = { all: ['android', 'evdiag', 's.r.o', 'bloom.app', 'coming to google play'],
    cs: ['maminka', 'maminko', 'brzy na google play'], ru: ['андроид', 'мамочк', 'мамуль', 'скоро в google play'], th: ['แอนดรอยด์'], zh: ['安卓', '宝妈', '麻麻'] };
  const SOON = { cs: 'brzy', ru: 'скоро', th: 'เร็วๆ นี้', zh: '即将' };
  const RECIPIENTS = ['Anthropic', 'OpenAI', 'Cloudflare', 'RevenueCat', 'Apple', 'Google', 'Resend', 'Health Connect'];
  const plain = h => textOf(h).replace(/\s+/g, ' ');
  for (const l of XX) {
    check(`${l}: src/i18n/${l}.json exists`, B.hasLang(l));
    if (!B.hasLang(l)) continue;
    const W = B.words(l);
    const missing = Object.keys(en).filter(k => typeof W[k] !== 'string' || !W[k].trim());
    check(`${l}: every English key has a value`, missing.length === 0, missing.slice(0, 8).join(' '));
    const extra = Object.keys(W).filter(k => !(k in en));
    check(`${l}: no key English lacks`, extra.length === 0, extra.join(' '));
    const same = Object.keys(en).filter(k => W[k] === en[k] && !SAME_OK.has(k) && /[a-z]{3}/.test(en[k]));
    check(`${l}: nothing left in English`, same.length === 0, same.slice(0, 8).join(' '));
    for (const k of Object.keys(W)) {
      const ph = s => JSON.stringify([...String(s).matchAll(/\{\{\{?([^{}]+)\}?\}\}|\{(\w+)\}/g)].map(m => m[1] || m[2]).sort());
      if (k in en && k !== 'foot.links') check(`${l}: ${k} keeps the placeholders`, ph(W[k]) === ph(en[k]), `${ph(W[k])} vs ${ph(en[k])}`);
      // the same links (a link into the English policy may point at another part of her summary: the fragment may differ)
      const links = s => JSON.stringify([...String(s).matchAll(/href="([^"]*)"/g)].map(m => m[1].replace(/^(\{\{root\}\}\/privacy\.html)#.*$/, '$1')).sort());
      if (k in en && !k.startsWith('foot.') && /href=/.test(en[k])) check(`${l}: ${k} keeps its links`, links(W[k]) === links(en[k]), `${links(W[k])} vs ${links(en[k])}`);
    }
    // the warnings keep their meaning: each carries its language's words for what it must say
    const MUST = {
      'warn.general': { cs: ['lékařsk', 'antikoncep'], ru: ['медицинск', 'контрацеп'], th: ['การแพทย์', 'คุมกำเนิด'], zh: ['医疗建议', '避孕'] },
      'foot.warn': { cs: ['lékařsk', 'zdravotnický prostředek', 'antikoncep'], ru: ['медицинск', 'медицинское изделие', 'контрацеп'], th: ['การแพทย์', 'เครื่องมือแพทย์', 'คุมกำเนิด'], zh: ['医疗建议', '医疗器械', '避孕'] },
      'warn.askDoctor': { cs: ['lékař', 'porodní asistent'], ru: ['врач', 'акушер'], th: ['แพทย์', 'ผดุงครรภ์'], zh: ['医生', '助产士'] },
      'warn.emergency': { cs: ['tísňov'], ru: ['экстренн'], th: ['ฉุกเฉิน'], zh: ['急'] },
      'ask.flow': { cs: ['Anthropic', 'OpenAI', 'přímo'], ru: ['Anthropic', 'OpenAI', 'прямо'], th: ['Anthropic', 'OpenAI', 'โดยตรง'], zh: ['Anthropic', 'OpenAI', '直接'] },
      'faq.medical.a': { cs: ['antikoncep', 'odhad'], ru: ['контрацеп', 'оценка'], th: ['คุมกำเนิด', 'ประมาณ'], zh: ['避孕', '估算'] },
    };
    if (l === 'zh') for (const k of ['home.priv.t2', 'sum.short.3']) check(`zh: ${k} says your data is never sold, not "nothing is sold" (Pro is sold)`, String(W[k]).includes('数据'), W[k]);
    for (const [k, by] of Object.entries(MUST)) check(`${l}: ${k} says ${by[l].join(' + ')}`, by[l].every(w => String(W[k] || '').toLowerCase().includes(w.toLowerCase())), W[k]);
    for (const f of B.pagesFor(l)) {
      check(`${f} exists`, exists(f));
      if (!exists(f)) continue;
      const h = read(f), t = plain(h), low = t.toLowerCase(), hl = noComments(h).toLowerCase();
      check(`${f}: <html lang="${B.HTML_LANG[l]}">`, h.includes(`<html lang="${B.HTML_LANG[l]}">`));
      check(`${f}: og:locale ${B.OG_LOCALE[l]}`, h.includes(`<meta property="og:locale" content="${B.OG_LOCALE[l]}">`));
      for (const w of [...BAN.all, ...BAN[l]]) check(`${f}: no "${w}"`, !hl.includes(w));
      check(`${f}: no price`, !/[$€£¥฿₽]|\bkč\b|\busd\b|\beur\b|\d+[.,]\d\d\b/i.test(t));
      for (const k of ['foot.warn']) check(`${f}: says ${k}`, t.includes(plain(B.expand(`{{${k}}}`, l, {}))));
      if (!f.endsWith('privacy.html')) for (const k of ['warn.general']) check(`${f}: says ${k}`, t.includes(plain(B.expand(`{{${k}}}`, l, {}))));
      if (f.endsWith('index.html')) for (const k of ['warn.askDoctor', 'warn.emergency', 'ask.flow']) check(`${f}: says ${k}`, t.includes(plain(B.expand(`{{{${k}}}}`, l, {}))));
      check(`${f}: Roman Franta only on the summary`, f.endsWith('privacy.html') || !low.includes('roman franta'));
      const foot = between(h, /<footer class="site-foot"[\s\S]*?<\/footer>/);
      for (const u of [`/${l}/support.html`, `/${l}/privacy.html`, '/privacy.html', '/privacy.html#health-data', '/terms.html', 'mailto:support@bloomdays.family'])
        check(`${f}: the footer links ${u}`, foot.includes(`href="${u}"`));
      check(`${f}: no font preload (${l === 'cs' ? 'Fraunces/Outfit preloaded' : 'the phone\'s fonts'})`, l === 'cs' ? /rel="preload" href="\/fonts\//.test(h) : !/\/fonts\//.test(h));
      // the app's own words, exactly as the app has them
      const tpl = fs.readFileSync(path.join(ROOT, 'src/pages', f.endsWith('privacy.html') ? 'summary.html' : f.split('/')[1]), 'utf8');
      const appKeys = new Set([...tpl.matchAll(/\{\{app:([^}]+)\}\}/g)].map(m => m[1]));
      for (const k of B.keysUsed(l, f)) for (const m of String(B.words(l)[k] || '').matchAll(/\{\{app:([^}]+)\}\}/g)) appKeys.add(m[1]);
      for (const k of appKeys) check(`${f}: the app's word ${k} = "${B.appWords()[k][l]}"`, t.includes(B.appWords()[k][l]));
    }
    const sum = `${l}/privacy.html`;
    if (exists(sum)) {
      const h = read(sum), t = plain(h);
      for (const r of RECIPIENTS) check(`${sum}: names ${r}`, t.includes(r));
      const box = between(h, /<div class="card sage applies"[\s\S]*?<\/div>/);
      check(`${sum}: the box links the English policy and the terms`, box.includes('href="/privacy.html"') && box.includes('href="/terms.html"'));
      check(`${sum}: ten rows, as the English table + the support form`, (h.match(/<tr><td/g) || []).length === 10);
      check(`${sum}: Roman Franta and Singapore`, t.includes('Roman Franta') && /Singap|Сингап|สิงคโปร์|新加坡/.test(t));
      for (const id of ['who', 'short', 'leaves', 'choices', 'health-data']) check(`${sum}: #${id}`, h.includes(`id="${id}"`));
    }
  }
  // the badges in her language: Apple's and Google's official artwork, App Store first, 48 px high
  for (const l of XX) for (const f of ['index.html', 'support.html'].map(p => `${l}/${p}`)) {
    if (!exists(f)) continue;
    const h = read(f);
    for (const m of h.matchAll(/<div class="badges"[\s\S]*?<\/div>/g)) {
      const imgs = [...m[0].matchAll(/<img src="([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]+)">/g)].map(x => ({ src: x[1], w: +x[2], h: +x[3], alt: x[4] }));
      check(`${f}: two badges`, imgs.length === 2);
      if (imgs.length !== 2) continue;
      check(`${f}: App Store first, from img/badges/${l}/`, imgs[0].src === `/img/badges/${l}/app-store.svg` && /^\/img\/badges\/[a-z]{2}\/google-play\.(svg|png)$/.test(imgs[1].src) && imgs[1].src.startsWith(`/img/badges/${l}/`), imgs.map(i => i.src).join(' '));
      check(`${f}: both 48 px high`, imgs.every(i => i.h === 48));
      check(`${f}: the badge alts in her language`, imgs[0].alt !== 'Download on the App Store' && imgs[1].alt !== 'Get it on Google Play');
      for (const i of imgs) {
        const ok = exists(i.src.slice(1));
        check(`${i.src} exists`, ok);
        if (!ok) continue;
        let ratio = 0;
        if (i.src.endsWith('.svg')) { const vb = read(i.src.slice(1)).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); ratio = vb ? vb[1] / vb[2] : 0; }
        else { const b = readBuf(i.src.slice(1)); ratio = b.readUInt32BE(16) / b.readUInt32BE(20); check(`${i.src}: a PNG at least 2× (≥ 96 px high)`, b.readUInt32BE(20) >= 96); }
        check(`${i.src}: width ${i.w} keeps its shape at 48 px`, ratio > 0 && Math.abs(i.w - 48 * ratio) <= 1, `${(48 * ratio).toFixed(1)}`);
      }
    }
  }

  const css = read('css/site.css');
  for (const f of ['fraunces-latin-ext-opsz-normal.woff2', 'fraunces-latin-ext-opsz-italic.woff2', 'outfit-latin-ext-wght-normal.woff2'])
    check(`latin-ext font ${f}: in fonts/ and in site.css with a unicode-range`, exists('fonts/' + f) && new RegExp(`@font-face \\{[^}]*${f.replace(/\./g, '\\.')}[^}]*unicode-range`).test(css));
  check('site.css: the latin files keep to latin (unicode-range)', /@font-face \{[^}]*fraunces-latin-opsz-normal[^}]*unicode-range/.test(css));
  check('site.css: :lang(ru), :lang(th), :lang(zh-Hans) use the phone\'s fonts', /:lang\(ru\)[\s\S]*?:lang\(th\)[\s\S]*?:lang\(zh-Hans\)[^{]*\{[^}]*--font-display:[^;]*system-ui/.test(css));
  check('site.css: Thai line height 1.8', /:lang\(th\)[^{]*\{[^}]*line-height:\s*1\.8/.test(css));
  check('site.css: the summary table labels from data-label', /\.sum-table td::before\s*\{[^}]*content:\s*attr\(data-label\)/.test(css));
});

// ── §14 the store buttons link to the stores (Roman, 2026-11-13: links now, even while the iPhone app waits for Apple)
SECTIONS.push(async () => {
  if (!section(14, 'the store links')) return;
  const AS = 'https://apps.apple.com/app/id6833483759', GP = 'https://play.google.com/store/apps/details?id=family.bloomdays';
  const B = exists('build.js') ? require(path.join(ROOT, 'build.js')) : null;
  const files = B ? B.LANGS.flatMap(l => B.pagesFor(l)) : PAGES;
  const SOON = { en: /coming soon|coming to/i, cs: /brzy|míří/i, ru: /скоро|появится/i, th: /เร็วๆ นี้|กำลังจะมาบน/, zh: /即将|将来到/ };
  for (const f of files) {
    const h = read(f), l = (f.match(/^(cs|ru|th|zh)\//) || [, 'en'])[1];
    const badges = [...h.matchAll(/<(a|span) class="badge"([^>]*)>/g)];
    for (const b of badges) {
      const store = (b[2].match(/data-store="(\w+)"/) || [])[1];
      check(`${f}: the ${store} badge is a link`, b[1] === 'a' && !/aria-disabled/.test(b[2]));
      check(`${f}: the ${store} badge goes to its store`, b[2].includes(`href="${store === 'appStore' ? AS : GP}"`), b[2]);
    }
    check(`${f}: no "coming soon" line`, !/badge-note/.test(h));
    if (!/privacy\.html$|terms\.html$/.test(f)) check(`${f}: no coming-soon words`, !SOON[l].test(textOf(h)), (textOf(h).match(SOON[l]) || [])[0]);
  }
  const js = read('js/site.js');
  check('site.js: STORE holds both links', js.includes(`appStore: '${AS}'`) && js.includes(`googlePlay: '${GP}'`));
  check('site.js: may call apps.apple.com', true);
});

const AUDIT = () => {
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const rgb = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return p.length === 3 ? [...p, 1] : p; };
  const ground = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; } return [249, 242, 232, 1]; };
  const out = { tap: [], contrast: [], small: [] };
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.right > 0 && r.left < innerWidth && !el.closest('[aria-hidden="true"]'); };
  for (const el of document.querySelectorAll('a, button, input:not([type="radio"]), textarea, summary, label.chip')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /^(P|LI|TD|STRONG|EM|SPAN)$/.test(el.parentElement.tagName);
    if (inline ? r.height < 20 : (r.height < 44 || r.width < 44)) out.tap.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode; if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el) || !vis(el) || el.closest('.badge, script, style, noscript')) continue; seen.add(el);
    const cs = getComputedStyle(el), fg = rgb(cs.color); if (!fg) continue;
    const bg = ground(el), a = fg[3];
    const mix = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
    const L1 = lum(mix), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = px >= 24 || (bold && px >= 18.66);
    if (ratio < (large ? 3 : 4.5)) out.contrast.push(`"${n.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1 at ${px}px`);
    if (el.closest('main') && px < 16 && !el.closest('.eyebrow, .code-box, h1, h2, h3') && !/uppercase/.test(cs.textTransform)) out.small.push(`"${n.textContent.trim().slice(0, 30)}" ${px}px`);
  }
  out.edge = [];
  for (const el of document.querySelectorAll('main h1, main h2, main h3, main p, main li, main summary, main label')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect();
    if (r.left < 15 || r.right > innerWidth - 15) out.edge.push(`${el.tagName} "${el.textContent.trim().slice(0, 24)}" ${Math.round(r.left)}–${Math.round(r.right)}`);
  }
  return out;
};
SECTIONS.push(async () => {
  if (!browserSection(11, 'phones')) return;
  for (const f of ALL_PAGES) {
    const url = f === '404.html' ? '/r/ABC123' : '/' + f;
    for (const w of [320, 360, 390, 412]) {
      await withPage(url, { width: w }, async p => {
        await p.evaluate(() => document.fonts.ready);
        const sw = await p.evaluate(() => document.documentElement.scrollWidth);
        check(`${f} @${w}: no sideways scroll`, sw <= w, `${sw}`);
        const a = await p.evaluate(AUDIT);
        check(`${f} @${w}: tap targets ≥ 44 px`, a.tap.length === 0, a.tap.slice(0, 4).join(' · '));
        check(`${f} @${w}: text contrast`, a.contrast.length === 0, a.contrast.slice(0, 4).join(' · '));
        check(`${f} @${w}: text ≥ 16 px`, a.small.length === 0, a.small.slice(0, 4).join(' · '));
        check(`${f} @${w}: 16 px side room for text`, a.edge.length === 0, a.edge.slice(0, 3).join(' · '));
      });
    }
    await withPage(url, { width: 360 }, async p => {
      await p.click('.nav-toggle');
      const shown = await p.locator('#site-nav a').evaluateAll(as => as.filter(a => a.getBoundingClientRect().height > 0).length);
      check(`${f}: the menu opens with five links at 360`, shown === 5 && (await p.getAttribute('.nav-toggle', 'aria-expanded')) === 'true', String(shown));
      await p.keyboard.press('Escape');
      check(`${f}: Escape closes the menu`, (await p.getAttribute('.nav-toggle', 'aria-expanded')) === 'false');
    });
    // Review Focus 5, the whole page zoomed 130 % (everything in px grows too), at 360 and 320
    for (const w of [360, 320]) await withPage(url, { width: w }, async p => {
      await p.addStyleTag({ content: 'html { zoom: 1.3; }' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(100);
      const wide = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && !e.closest('[aria-hidden="true"], .table-wrap, .hp'); }).slice(0, 3).map(e => e.tagName + '.' + e.className));
      check(`${f} @${w}, zoom 130 %: nothing past the right edge`, wide.length === 0, wide.join(' '));
    });
    // Review Focus 5: the phone's text at 130 %
    await withPage(url, { width: 360 }, async p => {
      await p.addStyleTag({ content: 'html { font-size: 130% !important; } body { font-size: 130% !important; }' });
      await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(100);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(`${f} @360, text 130 %: no sideways scroll`, sw <= 360, String(sw));
      const overlap = await p.evaluate(() => {
        const els = [...document.querySelectorAll('main p, main li, main h1, main h2, main h3, main summary, main label, main td')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden],[aria-hidden="true"],details:not([open]) > :not(summary)'));
        const rs = els.map(e => [e, e.getBoundingClientRect()]);
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const [a, ra] = rs[i], [b, rb] = rs[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (ox > 2 && oy > 2) return `${a.tagName} "${a.textContent.trim().slice(0, 20)}" × ${b.tagName} "${b.textContent.trim().slice(0, 20)}"`;
        }
        return '';
      });
      check(`${f} @360, text 130 %: no text over other text`, !overlap, overlap);
      await p.click('.nav-toggle');
      check(`${f} @360, text 130 %: the menu still opens`, (await p.getAttribute('.nav-toggle', 'aria-expanded')) === 'true');
    });
  }
});

module.exports = { ROOT, PORT, PAGES, PAGES_SPEC, pageText, textOf, withPage, serve, resolveFile };
if (require.main === module) main().catch(e => { console.error(e); console.log(`========== ${passed} passed, ${failed + 1} failed ==========`); process.exit(1); });
