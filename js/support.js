// bloomdays.family — the support form. It sends to the temporary sender (a Cloudflare Worker, bloomdays-contact) until the site
// moves to Cloudflare; then ENDPOINT becomes '/api/contact'. SEND = false shows the copy-and-email box instead of sending.
const SEND = true;
const ENDPOINT = 'https://bloomdays-contact.evdiag.workers.dev/api/contact';
const MIN_MS = 3000, TIMEOUT_MS = 15000, MAX_LEN = 5000, MIN_LEN = 10, MAILTO_MAX = 1500;
const EMAIL = 'support@bloomdays.family';
const LABELS = { bug: 'Report a bug', idea: 'New idea', feature: 'Feature request', feedback: 'Feedback', other: 'Something else' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The words she reads come from the page (data-msg, written by build.js in her language); the email to us names the type in English.
const form = document.getElementById('contact');
const M = (() => { try { return JSON.parse(form.dataset.msg); } catch { return {}; } })();
const LOC = document.documentElement.lang || 'en';
const num = n => n.toLocaleString(LOC);
const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : ''));

const shownAt = Date.now();

function collect(form) {
  const f = form.elements;
  const typeEl = form.querySelector('input[name="type"]:checked');
  return { email: f.email.value.trim(), type: typeEl ? typeEl.value : '', message: f.message.value.trim(),
    website: f.website.value, ms: Date.now() - shownAt, page: 'support' };
}

function validate(d) {
  const e = {};
  if (!d.email) e.email = M.email;
  else if (!EMAIL_RE.test(d.email) || d.email.length > 254) e.email = M.emailBad;
  if (!LABELS[d.type]) e.type = M.type;
  if ((d.message || '').length < MIN_LEN) e.message = M.short;
  else if (d.message.length > MAX_LEN) e.message = fill(M.long, { max: num(MAX_LEN) });
  return e;
}

async function send(d) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d), signal: ctl.signal });
    if (r.status !== 200) return 'fail';
    const j = await r.json().catch(() => null);
    return j && j.ok === true ? 'ok' : 'fail';
  } catch { return 'fail'; }
  finally { clearTimeout(timer); }
}

function fallbackText(d) {
  return `Type: ${LABELS[d.type] || d.type}\nFrom: ${d.email}\n\n${d.message}`;
}

function mailtoHref(d) {
  let body = d.message || '';
  if (body.length > MAILTO_MAX) {
    let cut = body.slice(0, MAILTO_MAX);
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);     // never split an emoji in half
    body = cut + '\n\n' + M.cut;
  }
  return `mailto:${EMAIL}?subject=${encodeURIComponent('Bloom · ' + (LABELS[d.type] || 'Message'))}&body=${encodeURIComponent(body)}`;
}

window.BloomSupport = { collect, validate, fallbackText, mailtoHref };

if (form) {
  const btn = form.querySelector('button[type="submit"]');
  const status = document.getElementById('c-status');
  const fb = document.getElementById('c-fallback');
  const hint = document.getElementById('c-msg-hint');
  const count = document.getElementById('c-msg-count');
  const fieldOf = { email: form.elements.email, type: form.querySelector('fieldset.types'), message: form.elements.message };
  const errOf = { email: 'c-email-err', type: 'c-type-err', message: 'c-msg-err' };
  let busy = false;

  const showErrors = e => {
    for (const k of Object.keys(errOf)) {
      document.getElementById(errOf[k]).textContent = e[k] || '';
      if (e[k]) fieldOf[k].setAttribute('aria-invalid', 'true'); else fieldOf[k].removeAttribute('aria-invalid');
    }
    const first = ['email', 'type', 'message'].find(k => e[k]);
    if (first) (first === 'type' ? form.querySelector('input[name="type"]') : fieldOf[first]).focus();
  };

  form.addEventListener('change', ev => {
    if (ev.target.name === 'type') hint.hidden = ev.target.value !== 'bug';
  });
  form.elements.message.addEventListener('input', () => {
    const n = form.elements.message.value.length;
    count.textContent = n >= 4500 ? fill(M.count, { n: num(n), max: num(MAX_LEN) }) : '';
  });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (busy) return;
    status.textContent = '';
    const d = collect(form);
    const e = validate(d);
    showErrors(e);
    if (Object.keys(e).length) return;
    const showFallback = lead => {
      fb.querySelector('[data-fb-lead]').textContent = lead;
      fb.querySelector('textarea').value = fallbackText(d);
      fb.querySelector('[data-mailto]').setAttribute('href', mailtoHref(d));
      fb.hidden = false;
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    if (!SEND) { showFallback(M.notYet); return; }
    const thanks = () => {
      const p = document.createElement('div');
      p.className = 'card sage thanks';
      p.setAttribute('role', 'status');
      p.textContent = fill(M.thanks, { email: d.email });
      form.replaceWith(p);
    };
    if (d.website || d.ms < MIN_MS) { thanks(); return; }        // a robot, most likely: say thank you, send nothing
    busy = true; btn.disabled = true; btn.textContent = M.sending;
    const r = await send(d);
    busy = false; btn.disabled = false; btn.textContent = M.send;
    if (r === 'ok') thanks();
    else { status.textContent = fill(M.fail, { support: EMAIL }); showFallback(M.didnt); }
  });

  fb.querySelector('[data-copy-msg]').addEventListener('click', async ev => {
    try { await navigator.clipboard.writeText(fb.querySelector('textarea').value); ev.target.textContent = M.copied; }
    catch { fb.querySelector('textarea').select(); ev.target.textContent = M.copyFail; }
  });
}
