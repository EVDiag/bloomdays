# Google Play Data Safety Form — Pre-filled Answers

Play Console → **App content** → **Data safety** form. These are the answers for Bloom's MVP closed test.

**Note:** If you add features later (cloud sync, partner sharing, etc.), you'll need to update this. Lying or omitting on this form is a serious violation that gets apps removed.

---

## Section 1: Data collection and security

### Does your app collect or share any of the required user data types?
**→ Yes**

(Bloom collects health/fitness data, even if local-only. Always say yes if you collect anything.)

### Is all of the user data collected by your app encrypted in transit?
**→ Yes**

(Use HTTPS for all network calls. Flutter's `http` package does this by default.)

### Do you provide a way for users to request that their data be deleted?
**→ Yes**

(Settings → Privacy → Delete all data, plus the email contact.)

### Has your app been independently validated against a global security standard?
**→ No**

(Unless you've actually paid for a SOC 2 audit. Honesty wins.)

---

## Section 2: Data types — declare each type collected

For each type below, you'll be asked:

1. **Is it collected?** (Yes if it ever leaves the app, even temporarily)
2. **Is it shared?** (with third parties)
3. **Optional or required?**
4. **Purpose** (multiple selectable)

### Personal info

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| Name | Yes | No | Optional | App functionality, Personalization |
| Email address | No | — | — | — |
| User IDs | Yes | No | Required | App functionality, Analytics |
| Address | No | — | — | — |
| Phone number | No | — | — | — |
| Race and ethnicity | No | — | — | — |
| Political or religious beliefs | No | — | — | — |
| Sexual orientation | No | — | — | — |
| Other info | No | — | — | — |

### Financial info

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| User payment info | No (handled by Google Play Billing) | — | — | — |
| Purchase history | Yes | No | Required | App functionality |
| Credit score | No | — | — | — |
| Other financial info | No | — | — | — |

### Health and fitness

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| Health info | Yes | No | Optional | App functionality, Personalization |
| Fitness info | Yes | No | Optional | App functionality, Personalization |

**Important:** "Health info" includes menstrual cycle data, pregnancy data, symptom logs. Even though it's stored locally, you must declare it as collected.

### Messages

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| Emails | No | — | — | — |
| SMS or MMS | No | — | — | — |
| Other in-app messages | Yes (AI assistant queries) | Yes (Anthropic) | Optional | App functionality |

### Photos and videos

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| Photos | Yes (bump diary photos) | No | Optional | App functionality |
| Videos | No | — | — | — |

### Audio files

All No.

### Files and docs

All No.

### Calendar

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| Calendar events | Yes (appointment reminders, stored locally) | No | Optional | App functionality |

### Contacts

All No. (Critical — never request contacts permission.)

### App activity

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| App interactions | Yes | No | Required | Analytics |
| In-app search history | No | — | — | — |
| Installed apps | No | — | — | — |
| Other user-generated content | Yes (journal entries) | No | Optional | App functionality |
| Other actions | No | — | — | — |

### Web browsing

All No.

### App info and performance

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| Crash logs | Yes | No | Required | Analytics |
| Diagnostics | Yes | No | Required | Analytics |
| Other app performance data | No | — | — | — |

### Device or other IDs

| Data type | Collected? | Shared? | Optional/Required | Purpose |
|---|---|---|---|---|
| Device or other IDs | Yes (anonymous install ID) | No | Required | Analytics |

---

## Section 3: Data security & deletion

### Data is encrypted in transit
**→ Yes**

### Users can request data deletion
**→ Yes**

### Data is anonymized
For analytics specifically: **Yes** (no personal info attached to analytics events)

For health data: **No** (it's tied to the user, even if stored only on their device)

---

## Section 4: Sensitive data declarations

Google flags pregnancy and menstruation as **highly sensitive**. You'll see a warning. This is fine — it just means Google's reviewers may scrutinize your privacy policy more carefully. That's why our privacy policy is thorough.

---

## Section 5: Health Apps Declaration (separate form)

In Play Console: **App content** → **Health apps declaration**

This is a separate form, also required for Bloom.

### Does your app provide health-related features or content?
**→ Yes**

### Which health-related features?
- [x] Health and wellness tracking (period, pregnancy, symptoms)
- [x] Health information (educational content about pregnancy)
- [ ] Medical functions (no — Bloom is not a medical device)
- [ ] Fitness tracking (no — though we have light step/water tracking)

### Do you have regulatory authorization (FDA, CE, etc.)?
**→ No**

### Have you posted appropriate disclaimers?
**→ Yes** (in-app and in privacy policy)

### Is your app intended to diagnose, treat, cure, or prevent disease?
**→ No**

(Critical — answering Yes here would make Bloom a medical device, which requires regulatory approval. Answer No, and ensure your in-app copy doesn't make medical claims.)

---

## Common pitfalls

1. **Never claim "we don't collect any data."** Even crash reports count as data. Honest, complete answers are safer.
2. **Health data is sensitive.** Even local-only health data must be declared.
3. **AI assistant data sharing.** When you add AI features, you must declare that user messages are shared with the AI provider (Anthropic). This is normal — just be honest.
4. **Update the form when features change.** Adding cloud sync? Update the form. Adding family sharing? Update the form.

---

## After submitting

Google reviews the form. You'll see a "Pending" status that usually resolves within hours. Once approved, the data safety summary appears on your Play Store listing — users can tap it to see exactly what data you collect.

Make sure your privacy policy URL works and matches what's declared. Discrepancies between privacy policy and data safety form are the #1 reason apps get rejected at this stage.
