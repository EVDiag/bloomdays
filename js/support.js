// bloomdays.family — the support form. It sends to the temporary sender (a Cloudflare Worker, bloomdays-contact) until the site
// moves to Cloudflare; then ENDPOINT becomes '/api/contact'. SEND = false shows the copy-and-email box instead of sending.
const SEND = true;
const ENDPOINT = 'https://bloomdays-contact.evdiag.workers.dev/api/contact';
const MIN_MS = 3000, TIMEOUT_MS = 15000, MAX_LEN = 5000, MIN_LEN = 10, MAILTO_MAX = 1500;
const EMAIL = 'support@bloomdays.family';
const LABELS = { bug: 'Report a bug', idea: 'New idea', feature: 'Feature request', feedback: 'Feedback', other: 'Something else' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const shownAt = Date.now();

function collect(form) {
  const f = form.elements;
  const typeEl = form.querySelector('input[name="type"]:checked');
  return { email: f.email.value.trim(), type: typeEl ? typeEl.value : '', message: f.message.value.trim(),
    website: f.website.value, ms: Date.now() - shownAt, page: 'support' };
}

function validate(d) {
  const e = {};
  if (!d.email) e.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(d.email) || d.email.length > 254) e.email = "That email doesn't look right.";
  if (!LABELS[d.type]) e.type = 'Please choose what it is about.';
  if ((d.message || '').length < MIN_LEN) e.message = 'Please write a little more.';
  else if (d.message.length > MAX_LEN) e.message = `Please keep it under ${MAX_LEN.toLocaleString('en')} characters.`;
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
    body = cut + '\n\n…(the full message is copied — paste it here)';
  }
  return `mailto:${EMAIL}?subject=${encodeURIComponent('Bloom · ' + (LABELS[d.type] || 'Message'))}&body=${encodeURIComponent(body)}`;
}

window.BloomSupport = { collect, validate, fallbackText, mailtoHref };

const form = document.getElementById('contact');
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
    count.textContent = n >= 4500 ? `${n.toLocaleString('en')} of ${MAX_LEN.toLocaleString('en')}` : '';
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
    if (!SEND) { showFallback("The form isn't sending yet."); return; }
    const thanks = () => {
      const p = document.createElement('div');
      p.className = 'card sage thanks';
      p.setAttribute('role', 'status');
      p.textContent = `Thank you — your message is on its way. We'll answer at ${d.email}.`;
      form.replaceWith(p);
    };
    if (d.website || d.ms < MIN_MS) { thanks(); return; }        // a robot, most likely: say thank you, send nothing
    busy = true; btn.disabled = true; btn.textContent = 'Sending…';
    const r = await send(d);
    busy = false; btn.disabled = false; btn.textContent = 'Send message';
    if (r === 'ok') thanks();
    else { status.textContent = `It didn't go through. Please try again, or write to ${EMAIL}.`; showFallback("It didn't go through."); }
  });

  fb.querySelector('[data-copy-msg]').addEventListener('click', async ev => {
    try { await navigator.clipboard.writeText(fb.querySelector('textarea').value); ev.target.textContent = 'Copied'; }
    catch { fb.querySelector('textarea').select(); ev.target.textContent = 'Select and copy the text above'; }
  });
}
