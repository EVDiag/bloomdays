#!/usr/bin/env node
// bloomdays.family — the page writer. Node 22, no packages.
//   node build.js                          writes every page of every language from src/
//   node build.js --check                  writes nothing; exit 1 if a page on disk differs from what it would write
//   node build.js --app ../Bloom-app/www/i18n   refreshes src/app-words.json (the keys already listed in it) from the app's packs
// Edit src/ (the templates in src/pages, the words in src/i18n), never the written pages.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const LANGS = ['en', 'cs', 'ru', 'th', 'zh'];
const HTML_LANG = { en: 'en', cs: 'cs', ru: 'ru', th: 'th', zh: 'zh-Hans' };
const OG_LOCALE = { en: 'en_US', cs: 'cs_CZ', ru: 'ru_RU', th: 'th_TH', zh: 'zh_CN' };
const SWITCH_TEXT = { en: 'EN', cs: 'CS', ru: 'RU', th: 'TH', zh: '中文' };
const SITE = 'https://bloomdays.family';
// the store listings (the App Store one answers once Apple approves Bloom; js/site.js holds the same two)
const STORE = { appStore: 'https://apps.apple.com/app/id6833483759', googlePlay: 'https://play.google.com/store/apps/details?id=family.bloomdays' };
const EN_PAGES = ['index.html', 'support.html', 'privacy.html', 'terms.html', '404.html', 'guide.html'];
const XX_PAGES = ['index.html', 'support.html', 'privacy.html', 'guide.html'];
// the languages the guide is written in
const GUIDE_LANGS = LANGS;
// which languages have each page (the switch and hreflang follow this): the English policy and the summaries are different pages
const SIBLINGS = { 'index.html': LANGS, 'support.html': LANGS, 'guide.html': GUIDE_LANGS };
const NAV = [['/index.html#chapters', 'nav.chapters', null], ['/index.html#ask', 'nav.ask', null], ['/index.html#family', 'nav.family', null],
  ['/privacy.html', 'nav.privacy', 'privacy.html'], ['/support.html', 'nav.support', 'support.html']];
const SCRIPTS = { 'support.html': '<script type="module" src="/js/support.js"></script>\n' };
const PRELOAD = '<link rel="preload" href="/fonts/fraunces-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>\n'
  + '<link rel="preload" href="/fonts/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>\n';

const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const hasLang = lang => fs.existsSync(path.join(SRC, 'i18n', lang + '.json'));
const cache = {};
function words(lang) { return cache[lang] || (cache[lang] = readJSON(path.join(SRC, 'i18n', lang + '.json'))); }
let appWordsCache = null;
function appWords() { return appWordsCache || (appWordsCache = readJSON(path.join(SRC, 'app-words.json'))); }
const has = (lang, k) => typeof words(lang)[k] === 'string' && words(lang)[k].trim() !== '';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rootOf = lang => (lang === 'en' ? '' : '/' + lang);
const outPath = (lang, page) => (lang === 'en' ? page : `${lang}/${page}`);
function pagesFor(lang) { return (lang === 'en' ? EN_PAGES : XX_PAGES).filter(p => p !== 'guide.html' || GUIDE_LANGS.includes(lang)).map(p => outPath(lang, p)); }
function split(file) { const m = file.match(/^(cs|ru|th|zh)\/(.+)$/); return m ? [m[1], m[2]] : ['en', file]; }
function templateOf(lang, page) { return lang !== 'en' && page === 'privacy.html' ? 'summary.html' : page; }
const readTemplate = name => fs.readFileSync(path.join(SRC, 'pages', name), 'utf8');

// {{key}} → the language's word, escaped; {{{key}}} → as HTML; {{app:key}} → the app's own word; {{@x}} → a value the writer made;
// {{lang}} {{htmlLang}} {{root}} {{path}}. Words may hold placeholders themselves (a link's {{root}}, an app word).
const TOKEN = /\{\{\{([^{}]+)\}\}\}|\{\{([^{}]+)\}\}/g;
// escNested: whether {{…}} inside str are escaped (true when str is HTML; false when str is a word whose whole text is escaped once at the end)
function expand(str, lang, ctx, dict, depth = 0, escNested = true) {
  if (depth > 6) throw new Error('placeholders nested too deep');
  const W = dict || words(lang);
  return str.replace(TOKEN, (_, raw, plain) => {
    const name = (raw || plain).trim();
    let v;
    if (name.startsWith('app:')) {
      const k = name.slice(4), e = appWords()[k];
      if (!e || typeof e[lang] !== 'string' || !e[lang]) throw new Error(`missing app word "${k}" for ${lang}`);
      v = e[lang];
    } else if (name.startsWith('@json:')) {
      const pre = name.slice(6) + '.', o = {};
      for (const k of Object.keys(W)) if (k.startsWith(pre)) o[k.slice(pre.length)] = text(lang, k, ctx);
      v = JSON.stringify(o);
    } else if (name.startsWith('@')) {
      if (!ctx || !(name in ctx)) throw new Error(`no value "${name}"`);
      v = ctx[name];
    } else if (name === 'lang') v = lang;
    else if (name === 'htmlLang') v = HTML_LANG[lang];
    else if (name === 'root') v = rootOf(lang);
    else if (name === 'path') v = ctx && ctx.path;
    else {
      if (typeof W[name] !== 'string') throw new Error(`missing key "${name}" for ${lang}`);
      v = raw ? expand(W[name], lang, ctx, dict, depth + 1, true) : expand(W[name], lang, ctx, dict, depth + 1, false);
    }
    return raw || !escNested ? v : esc(v);
  });
}
const text = (lang, key, ctx) => expand(`{{${key}}}`, lang, ctx, null, 0, false);

function keysIn(str, seen = new Set(), lang) {
  for (const m of str.matchAll(TOKEN)) {
    const n = (m[1] || m[2]).trim();
    if (n.startsWith('app:') || n.startsWith('@') || ['lang', 'htmlLang', 'root', 'path'].includes(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    if (lang && typeof words(lang)[n] === 'string') keysIn(words(lang)[n], seen, lang);
  }
  return seen;
}
function keysUsed(lang, file) {
  const [, page] = split(file);
  const seen = keysIn(readTemplate('frame.html'), new Set(), lang);
  keysIn(readTemplate(templateOf(lang, page)), seen, lang);
  const key = page.replace('.html', '');
  for (const k of [`page.${key}.title`, `page.${key}.desc`]) seen.add(k);
  return [...seen];
}

function switchFor(lang, page) {
  if (page === '404.html') return '';
  const sib = lang === 'en' ? (SIBLINGS[page] || ['en']) : (SIBLINGS[page] || (page === 'privacy.html' ? LANGS.filter(l => l !== 'en') : [lang]));
  const a = LANGS.map(l => {
    const target = sib.includes(l) ? '/' + outPath(l, page) : '/' + outPath(l, 'index.html');
    return `<a href="${target}" hreflang="${HTML_LANG[l]}" lang="${HTML_LANG[l]}"${l === lang ? ' aria-current="true"' : ''}>${SWITCH_TEXT[l]}</a>`;
  });
  return `\n  <nav class="lang-switch" aria-label="${esc(text(lang, 'frame.langLabel'))}">${a.join('<span aria-hidden="true"> · </span>')}</nav>`;
}

// a page's address on the site (Home is the folder)
const urlOf = (lang, page) => `${SITE}/${page === 'index.html' ? (lang === 'en' ? '' : lang + '/') : outPath(lang, page)}`;
// the alternates of a page, as its head lists them (and sitemap.xml): the summaries point to each other only (the English policy
// is another page); Home, Support and the guide to every language + x-default; the English policy, the terms and 404 to none
function alternatesOf(lang, page) {
  if (page === 'privacy.html') return lang === 'en' ? [] : LANGS.filter(l => l !== 'en').map(l => ({ hreflang: HTML_LANG[l], href: `${SITE}/${outPath(l, page)}` }));
  const sib = SIBLINGS[page];
  if (!sib) return [];
  return [...sib.map(l => ({ hreflang: HTML_LANG[l], href: urlOf(l, page) })), { hreflang: 'x-default', href: urlOf('en', page) }];
}

function render(lang, file) {
  const [l2, page] = file.includes('/') ? split(file) : [lang, file];
  if (l2 !== lang) throw new Error(`${file} is not a ${lang} page`);
  const key = page.replace('.html', '');
  const url = `${SITE}/${page === 'index.html' ? (lang === 'en' ? '' : lang + '/') : outPath(lang, page)}`;
  const is404 = page === '404.html';
  const alternates = alternatesOf(lang, page).map(a => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">\n`).join('');
  const ctx = { path: '/' + file };
  ctx['@title'] = text(lang, `page.${key}.title`, ctx);
  ctx['@desc'] = text(lang, `page.${key}.desc`, ctx);
  ctx['@robots'] = is404 ? '<meta name="robots" content="noindex">\n' : '';
  ctx['@canon'] = is404 ? '' : `<link rel="canonical" href="${url}">\n`;
  ctx['@alternates'] = alternates;
  ctx['@ogLocale'] = lang === 'en' ? '' : `<meta property="og:locale" content="${OG_LOCALE[lang]}">\n`;
  ctx['@ogUrl'] = is404 ? SITE + '/' : url;
  ctx['@preload'] = ['en', 'cs'].includes(lang) ? PRELOAD : '';
  ctx['@nav'] = NAV.map(([h, k, cur]) => `<a href="${rootOf(lang)}${h}"${cur === page ? ' aria-current="page"' : ''}>${esc(text(lang, k, ctx))}</a>`).join('');
  ctx['@switch'] = switchFor(lang, page);
  ctx['@scripts'] = SCRIPTS[page] || '';
  ctx['@appStore'] = STORE.appStore;
  ctx['@googlePlay'] = STORE.googlePlay;
  ctx['@shots'] = lang === 'en' ? '/img/screens' : `/img/screens/${lang}`;
  ctx['@i18n404'] = is404 ? i18n404() : '';
  ctx['@jsonld'] = page === 'index.html' ? jsonld(lang, url) : '';
  ctx['@body'] = expand(readTemplate(templateOf(lang, page)).replace(/\n+$/, ''), lang, ctx);
  return expand(readTemplate('frame.html'), lang, ctx);
}

// the search engines' details of the app, on each Home: free (price 0), both stores, no ratings and no reviews (none exist), nothing of Pro
function jsonld(lang, url) {
  const o = { '@context': 'https://schema.org', '@type': 'MobileApplication', name: 'Bloom', operatingSystem: 'iOS, Android', applicationCategory: 'HealthApplication',
    inLanguage: HTML_LANG[lang], description: text(lang, 'page.index.desc'), url, downloadUrl: [STORE.appStore, STORE.googlePlay],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } };
  return `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>\n`;
}

// sitemap.xml: every page of every language but 404.html, at its canonical address, with the alternates its head lists
function sitemap() {
  const x = s => s.replace(/&/g, '&amp;');
  const rows = [];
  for (const lang of LANGS) for (const f of pagesFor(lang)) {
    const [, page] = split(f);
    if (page === '404.html') continue;
    rows.push(`<url><loc>${x(urlOf(lang, page))}</loc>${alternatesOf(lang, page).map(a => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${x(a.href)}"/>`).join('')}</url>`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + rows.join('\n') + '\n</urlset>\n';
}

// the not-found and invite words of every language, for js/site.js to choose from on the phone
const WORDS_404 = ['nf.title', 'nf.lede', 'nf.home', 'nf.haveApp', 'inv.title', 'inv.lede', 'inv.copy', 'inv.copied', 'inv.copyFail', 'inv.steps', 'inv.docTitle'];
function i18n404() {
  const o = {};
  for (const l of LANGS) { o[l] = { title: text(l, 'page.404.title') }; for (const k of WORDS_404) o[l][k] = text(l, k); }
  return `<script type="application/json" id="i18n-404">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
}

function all() {
  const out = [];
  for (const lang of LANGS) for (const f of pagesFor(lang)) out.push([f, render(lang, f)]);   // every language must have its words
  out.push(['sitemap.xml', sitemap()]);
  return out;
}

// the app's own words: the site's wording rules — no "(JSON)" after Export, sentence case for a word the app shows in capitals, a setting without its state
function siteForm(v, key) {
  v = String(v).replace(/\s*[（(]JSON[）)]/, '');
  v = v.replace(/\s*·\s*[^·]*\$\s?\d[^·]*$/, '');   // no price: "Upgrade to Pro · $3 lifetime" → "Upgrade to Pro" (the store shows hers)
  if (/\.row\.off$/.test(key || '')) v = v.replace(/\s*[:：][^:：]*$/, '');   // a setting's name without its state (": off")
  if (v === v.toUpperCase() && v !== v.toLowerCase()) v = v.charAt(0) + v.slice(1).toLowerCase();
  return v;
}
function refreshApp(dir) {
  const cur = appWords(), next = {};
  for (const k of Object.keys(cur)) {
    next[k] = {};
    for (const l of LANGS) {
      const s = readJSON(path.join(dir, l + '.json')).strings[k];
      if (typeof s !== 'string') throw new Error(`the app's ${l}.json has no "${k}"`);
      next[k][l] = siteForm(s, k);
    }
  }
  fs.writeFileSync(path.join(SRC, 'app-words.json'), JSON.stringify(next, null, 2) + '\n');
  console.log(`src/app-words.json: ${Object.keys(next).length} words from ${dir}`);
}

module.exports = { LANGS, HTML_LANG, OG_LOCALE, GUIDE_LANGS, SITE, pagesFor, render, keysUsed, alternatesOf, urlOf, expand, has, hasLang, words, appWords, siteForm, all };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--app') { refreshApp(path.resolve(args[1] || '../Bloom-app/www/i18n')); process.exit(0); }
  const check = args.includes('--check');
  let bad = 0;
  for (const [f, html] of all()) {
    const p = path.join(ROOT, f);
    if (check) {
      const disk = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      if (disk !== html) { bad++; console.log(`${f} differs from what build.js writes — edit src/ and run node build.js`); }
    } else {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, html);
      console.log('wrote', f, Buffer.byteLength(html));
    }
  }
  if (check) { console.log(bad ? `${bad} page(s) differ` : 'all pages are what build.js writes'); process.exit(bad ? 1 : 0); }
}
