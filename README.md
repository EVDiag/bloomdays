# bloomdays.family

The website of Bloom — a companion for every season of becoming a mother. Plain HTML and CSS, served by GitHub Pages
from this folder (`CNAME`, `.nojekyll`). `/.well-known/assetlinks.json` is Android App Links' file: never change it. `/.well-known/apple-app-site-association` (no extension) is the iPhone's: it hands `https://bloomdays.family/r/CODE` to Bloom (`WVYCZK9F9V.family.bloomdays`); `verify-site.js` §17 checks it.

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
- Both badges are shown 48 px high and link to the listings (`build.js` and `js/site.js`, `STORE`): Google Play's
  `details?id=family.bloomdays` and the App Store's `apps.apple.com/app/id6833483759` (Bloom's Apple ID; it answers once Apple approves the app).
- The other languages (`img/badges/cs|ru|th|zh/`): Apple's black badge in Czech, Russian, Thai and Simplified Chinese as SVG, unchanged,
  from Apple's badge tool (toolbox.marketingtools.apple.com, `download-on-the-app-store/black/<cs-cz|ru-ru|th-th|zh-cn>`, read 2026-11-13);
  Google's badge in Czech, Russian, Thai and Chinese (China) as PNG from play.google.com/intl/en_us/badges/static/images/badges/
  `<cs|ru|th|zh-cn>_badge_web_generic.png` (read 2026-11-13; no SVG is offered without a Partner Marketing Hub login) — only its
  transparent top and bottom rows trimmed (646 × 192 px, four times the 48 px it is shown at). The artwork is not changed.

## The support form

`js/support.js` posts to a small Cloudflare Worker, `bloomdays-contact` (its source is in the Bloom-app repo,
`tools/site/contact-worker/`), which sends each message through Resend to the support inbox. When the site moves to
Cloudflare (`claude/bloom-website-move.md`), `ENDPOINT` becomes `/api/contact` and that Worker is deleted.
`const SEND = false;` turns sending off: the page then offers the copy-and-email box instead.

## The guide (`guide.html`, `xx/guide.html`)

How the app works, section by section, in five languages: its words are the `guide.*` keys in `src/i18n/*.json`, and every
place in the app it names is an app word (`{{app:…}}` from `src/app-words.json`). Before a guide step names a place, the place is
walked in the app: `node tools/site/guide-walk.js --app www --all` in Bloom-app (Playwright), then
`node tools/site/guide-walk.js --check ../bloomdays`. Its pictures come from `node tools/site/screens.js --lang <xx> --only …`.
After an app build renames a menu: `node build.js --app ../Bloom-app/www/i18n`, the walk, `node build.js`, `node verify-site.js`.

## For search engines

`robots.txt` (allow all, names the sitemap) is a plain file; `sitemap.xml` is written by `build.js` (every page but 404, with its
language alternates). Every page carries Safari's app banner (`apple-itunes-app`, Bloom's Apple ID); each Home carries one
JSON-LD block (`MobileApplication`: free, both stores, no ratings).
