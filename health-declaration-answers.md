# Health Apps Declaration — Pre-filled Answers

Bloom is a health-related app and Google Play requires you to complete the Health Apps Declaration form. This is **separate** from the Data Safety form.

In Play Console: **Monitor & Improve** → **Policy** → **App content** → **Health apps declaration**

---

## Q1: Does your app offer health-related features or information?

**→ Yes**

---

## Q2: Which categories apply?

Select all that apply:

- [x] **Wellness tracking** (cycle tracking, pregnancy tracking, symptom logging)
- [x] **Health information** (educational content about pregnancy, nutrition, fetal development)
- [ ] Medication management
- [ ] Fitness or workout tracking (water intake / steps are minor — debatable; safer to leave unchecked unless you build proper fitness features)
- [ ] Telehealth / clinical care (not yet — this would change once you add real telehealth integrations)
- [ ] Mental health diagnosis or therapy
- [ ] Diagnostic functions (definitely not)

---

## Q3: Does your app claim to diagnose, treat, cure, or prevent any disease?

**→ No**

This is the most important answer. Bloom **must not** make medical claims. Make sure all in-app copy follows this rule:

✅ **OK:** "Folate helps with healthy fetal development."
❌ **NOT OK:** "Take folate to prevent neural tube defects."

✅ **OK:** "Many women experience nausea in the first trimester."
❌ **NOT OK:** "If you have nausea, take ginger to cure it."

✅ **OK:** "Track your cycle to identify patterns."
❌ **NOT OK:** "Use Bloom to diagnose PCOS."

If you ever cross into medical claims, you become a regulated medical device and face FDA / CE / TGA approval requirements that take years and cost millions. Stay on the wellness side of the line.

---

## Q4: Has your app received regulatory clearance from any authority (FDA, CE, etc.)?

**→ No**

(Honest answer for an indie app at MVP stage.)

---

## Q5: Do you display appropriate medical disclaimers in your app?

**→ Yes**

The disclaimers in your app should appear:

1. **At onboarding** — already in step 5 of the onboarding flow
2. **In the AI assistant** — already in the AI screen disclaimer
3. **At the bottom of any informational article** (you'll add these as you build content library)
4. **In settings → about**

Standard disclaimer text:

> Bloom provides general information based on medical literature, not personal medical advice. Always consult a qualified healthcare provider for diagnosis, treatment, or any health concern. Bloom is not intended to diagnose, treat, cure, or prevent any disease.

Use this exact wording (or very close to it) consistently throughout.

---

## Q6: Where do you source your health information?

You'll need to provide this. For Bloom, it's:

> Health information in Bloom is based on guidelines from the American College of Obstetricians and Gynecologists (ACOG), the World Health Organization (WHO), the Mayo Clinic, NHS UK, and peer-reviewed pregnancy and women's health literature. We do not provide individualized medical advice. Users are always directed to consult their own healthcare provider for personalized guidance.

Save this — you'll paste it into the Play Console field.

---

## Q7: How do you handle sensitive health data?

> Bloom uses a local-first architecture. Health data including menstrual cycle, pregnancy logs, symptoms, and journal entries are stored on the user's device and are not transmitted to our servers. The user has full control to view, export, or delete their data at any time. Bloom does not sell or share user health data with advertisers, data brokers, insurance companies, or any third party. When the user voluntarily uses the AI assistant feature, the specific question (but not their personal logs) is sent to Anthropic's API for response generation; Anthropic does not retain or train on this data per their data processing terms.

---

## Special considerations for pregnancy/menstruation apps

Google updated its Health and Fitness data guidelines in April 2026 to specifically cover **Menstrual Cycle Phases** as a high-sensitivity category. The new policy:

- Prohibits using sensitive health data for determining employment or insurance eligibility (you should not be doing this anyway)
- Prohibits unauthorized social sharing of cycle/health data
- Requires granular permissions for accessing this data

**For Bloom MVP:** You're not collecting cycle data from external sources, only from user input within your own app, so the granular Health Connect permissions don't apply. You're fine.

When you later add **Health Connect integration** (a future feature for syncing with Apple Health / Google Fit / Oura), you'll need to:

1. Request only the specific data types you actually use
2. Use the new Android 16 granular permissions
3. Provide a clear in-app explanation of why you need each permission
4. Allow the user to revoke any single permission without breaking the app

---

## Recap — what to do before submitting

- [ ] Privacy policy is hosted at a public, non-geofenced URL
- [ ] Privacy policy URL is added in Play Console under "Privacy Policy"
- [ ] Data Safety form is submitted (see `data-safety-form-answers.md`)
- [ ] Health Apps Declaration is submitted (this file)
- [ ] App contains medical disclaimers in all relevant places
- [ ] No app copy makes medical claims (no "diagnose," "cure," "treat," "prevent disease")
- [ ] Sources for health content documented

Once these are all done, your closed test submission will pass review. Without them, it won't.
