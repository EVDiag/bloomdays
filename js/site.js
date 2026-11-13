// bloomdays.family — the small shared script: the phone menu, the store badges, the invite page.
'use strict';
document.documentElement.classList.add('js');

// The two listing URLs. Empty = the badge shows without a link. Fill each when its store page exists.
const STORE = { appStore: '', googlePlay: '' };
const PLAY_ID = 'family.bloomdays';

function inviteCode(pathname) {
  const m = String(pathname || '').match(/^\/r\/([A-Za-z0-9]{4,12})\/?$/);
  return m ? m[1].toUpperCase() : '';
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
  const both = STORE.appStore && STORE.googlePlay;
  document.querySelectorAll('.badge-note').forEach(n => { n.hidden = !!both; });
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
  if (!box || !nf) return;
  const code = inviteCode(location.pathname);
  if (!code) return;
  box.querySelectorAll('[data-code]').forEach(el => { el.textContent = code; });
  const play = box.querySelector('[data-store="googlePlay"]');
  if (play) setBadge(play, `https://play.google.com/store/apps/details?id=${PLAY_ID}&referrer=${encodeURIComponent('code=' + code)}`);
  const copy = box.querySelector('[data-copy]');
  if (copy) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Copy failed — hold the code to copy it'; }
  });
  nf.hidden = true;
  box.hidden = false;
  document.title = 'A little gift from a friend — Bloom';
}

initBadges();
initMenu();
initInvite();
