// bloomdays.family — the small shared script: the phone menu, the store badges, the not-found and invite page in her language.
'use strict';
document.documentElement.classList.add('js');

// The two listing URLs (the pages carry them too, from build.js). The App Store one answers once Apple approves Bloom.
const STORE = { appStore: 'https://apps.apple.com/app/id6833483759', googlePlay: 'https://play.google.com/store/apps/details?id=family.bloomdays' };
const PLAY_ID = 'family.bloomdays';

function inviteCode(pathname) {
  const m = String(pathname || '').match(/^\/r\/([A-Za-z0-9]{4,12})\/?$/);
  return m ? m[1].toUpperCase() : '';
}

// The not-found and invite page (404.html) carries its words in five languages; the phone's languages choose one (English otherwise).
const HTML_LANG = { en: 'en', cs: 'cs', ru: 'ru', th: 'th', zh: 'zh-Hans' };
function pickLang(languages, have) {
  have = have || Object.keys(HTML_LANG);
  for (const tag of languages || []) { const p = String(tag).toLowerCase().split('-')[0]; if (have.includes(p)) return p; }
  return 'en';
}
let W404 = null;
function applyLang404(lang, W) {
  document.documentElement.lang = HTML_LANG[lang] || lang;
  document.querySelectorAll('[data-t]').forEach(el => { if (W[el.dataset.t]) el.textContent = W[el.dataset.t]; });
  const home = document.querySelector('#notfound a.btn');
  if (home) home.setAttribute('href', lang === 'en' ? '/index.html' : `/${lang}/index.html`);
  if (W.title) document.title = W.title;
}
function init404() {
  const el = document.getElementById('i18n-404');
  if (!el) return;
  let all; try { all = JSON.parse(el.textContent); } catch { return; }
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  const lang = pickLang(langs, Object.keys(all));
  W404 = all[lang] || all.en;
  applyLang404(lang, W404);
}

function setBadge(el, href) {
  if (href) {
    if (el.tagName !== 'A') {
      const a = document.createElement('a');
      for (const at of el.attributes) if (at.name !== 'aria-disabled') a.setAttribute(at.name, at.value);
      a.innerHTML = el.innerHTML;
      el.replaceWith(a);
      el = a;
    }
    el.setAttribute('href', href);
    el.removeAttribute('aria-disabled');
  }
  return el;
}

function initBadges(root) {
  (root || document).querySelectorAll('[data-store]').forEach(el => setBadge(el, STORE[el.dataset.store] || ''));
}

function initMenu() {
  const btn = document.querySelector('.nav-toggle'), nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  const close = () => { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { close(); btn.focus(); } });
}

function initInvite() {
  const box = document.getElementById('invite'), nf = document.getElementById('notfound');
  if (!box || !nf || !W404) return;
  const code = inviteCode(location.pathname);
  if (!code) return;
  box.querySelectorAll('[data-code]').forEach(el => { el.textContent = code; });
  const play = box.querySelector('[data-store="googlePlay"]');
  if (play) setBadge(play, `https://play.google.com/store/apps/details?id=${PLAY_ID}&referrer=${encodeURIComponent('code=' + code)}`);
  const copy = box.querySelector('[data-copy]');
  if (copy) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); copy.textContent = W404['inv.copied']; }
    catch { copy.textContent = W404['inv.copyFail']; }
  });
  nf.hidden = true;
  box.hidden = false;
  document.title = W404['inv.docTitle'];
}

// The language switch keeps the part of the page she is on (#ask, #faq …) when it goes to the same page in another language.
function initSwitch() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.lang-switch a').forEach(a => a.addEventListener('click', () => {
    const there = a.getAttribute('href').split('#')[0].split('/').pop();
    if (location.hash && there === here) a.setAttribute('href', a.getAttribute('href').split('#')[0] + location.hash);
  }));
}

window.BloomSite = { pickLang, inviteCode };
initBadges();
initMenu();
initSwitch();
init404();
initInvite();
