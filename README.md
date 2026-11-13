# bloomdays.family

The website of Bloom — a companion for every season of becoming a mother. Plain HTML and CSS, served by GitHub Pages
from this folder (`CNAME`, `.nojekyll`). `/.well-known/assetlinks.json` is Android App Links' file: never change it.

Check everything before a push: `node verify-site.js` (Node 22; the browser sections run where Playwright is installed,
and say SKIP elsewhere). The last line is `========== N passed, M failed ==========`.

## The store badges (`img/badges/`)

The official artwork, unchanged: Apple's *Download on the App Store* (black, US-UK, from developer.apple.com/app-store/marketing/guidelines,
read 2026-11-13) and Google's *Get it on Google Play* (English, colour, from Google's Partner Marketing Hub, badge set of 2024-02-15).
Their rules, as read that day:
- Apple: the black badge whenever other stores' badges are beside it, and the App Store badge first; one App Store badge per layout;
  at least 40 px high on screen; clear space a quarter of its height; never modified, angled or animated.
- Google: at least 28 px high; the same size or larger than the other badges beside it; clear space a quarter of its height;
  never recoloured or rearranged; solid backgrounds only.
- Both badges are shown 48 px high. While a store has no listing, its badge has no link (`js/site.js`, `STORE`).

## The support form

`js/support.js` posts to a small Cloudflare Worker, `bloomdays-contact` (its source is in the Bloom-app repo,
`tools/site/contact-worker/`), which sends each message through Resend to the support inbox. When the site moves to
Cloudflare (`claude/bloom-website-move.md`), `ENDPOINT` becomes `/api/contact` and that Worker is deleted.
`const SEND = false;` turns sending off: the page then offers the copy-and-email box instead.
