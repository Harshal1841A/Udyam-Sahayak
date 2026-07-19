# UI/UX Design Brief
## Udyam Sahayak

Brutal starting point: most hackathon teams design one UI — a slick SaaS dashboard — and use it for everyone, because that's the template every AI design tool defaults to. This product has three completely different users with three completely different physical contexts and three completely different stakes. A single "clean modern dashboard" aesthetic applied to all of them is wrong for at least two of the three, and it's the single most common way teams like this lose visual credibility with judges who've seen fifty identical dashboards that day.

---

## 1. Stakeholders — Who's Actually Using This, and Under What Conditions

### 1.1 Field Officer / BC — primary user, PWA
- **Device:** low-to-mid Android tablet, outdoors, direct sunlight, possible screen glare
- **Physical state:** standing, one-handed or gloved, time-pressured (multiple visits/day), not seated at a desk
- **Digital literacy:** variable, no data-science background, may not be comfortable with small touch targets or dense text
- **Language:** vernacular-first, not English-with-a-translate-toggle
- **Emotional state:** needs confidence, not confusion — a wrong tap here has real financial consequences for someone standing in front of them
- **Stakes:** highest — this is the person actually making a credit-relevant decision, live, in front of a borrower

### 1.2 Institution Admin / NABARD Officer — secondary user, dashboard
- **Device:** desktop/laptop, indoor, seated
- **Digital literacy:** higher, comfortable with data density
- **Goal:** portfolio oversight — who needs attention *today*, not admiring a heatmap
- **Stakes:** medium — decisions here are about resource allocation and audit review, not point-of-sale credit calls

### 1.3 Enterprise Owner — passive subject, no login, no app
- **Device:** none — only sees the officer's tablet screen and hears audio, briefly, at one moment
- **Digital literacy:** may be low; may be the first time interacting with anything AI-related
- **Emotional state:** this is the most ethically loaded screen in the whole product — a stranger is capturing biometric consent and assessing their business on a tablet. If this feels extractive, surveillance-like, or condescending, the product has failed regardless of model accuracy
- **Stakes:** highest personal stakes, lowest interaction complexity — one screen, one decision, needs total clarity and dignity, not features

### 1.4 Hackathon Judge — not a real user, but real audience
- Sees the product for 3–5 minutes, cold, under stage lighting on a projector, at a distance. Small text, low contrast, or busy dashboards die on a projector even if they read fine on a laptop.

### 1.5 When These Needs Conflict — Priority Order, Stated Explicitly
These four stakeholders will pull the design in different directions, and pretending they won't is how a brief becomes decoration instead of a decision-making tool. When a choice has to be made:

1. **Enterprise Owner dignity is non-negotiable, full stop.** Not first because they're the most frequent user — they're not — but because this is the one place a wrong call causes real harm to a real person, not just a worse product. No feature, no admin convenience, no judge-facing polish overrides this.
2. **Field Officer usability comes second, ahead of everything downstream.** If a design choice makes the officer's job slower or more error-prone to make the dashboard richer or the pitch flashier, the officer wins. They're the one actually operating this in the field; every other stakeholder depends on their input being captured correctly.
3. **Institution Admin comes third.** Real, paying attention, but not present at the moment of highest stakes — a dashboard that's merely good is an acceptable trade against slowing the officer down.
4. **Judge is last, explicitly.** A judge's 3-minute impression should be a byproduct of the product being genuinely well-built for the first three, not a fourth design target competing for the same screen real estate. The moment a decision gets made because "it'll look good in the demo" rather than "it serves the officer or the enterprise owner," the priority order has been violated.

---

**Field Officer PWA: legibility and confidence under duress, not polish.** Large touch targets (48dp minimum, larger for primary actions), high-contrast type sized for outdoor glare (18px+ body, 24px+ for anything decision-critical), generous spacing so a moving tablet or a shaky hand doesn't mis-tap. This is not the place for subtle gray-on-gray SaaS aesthetics — those are designed for a seated person in indoor lighting, which is the opposite of this user's reality.

**Institution Dashboard: actionable density, not decorative density.** Admins want "who needs attention today" front and center, not a wall of charts that photograph well for a pitch deck but require interpretation to act on. Every chart earns its place by answering a specific question an admin actually has — if it doesn't, cut it. A heatmap that looks impressive but nobody actually reads to make a decision is chartjunk, not insight.

**Consent Screen: dignity, not extraction.** This is not a "product screen," it's a moment between two people mediated by a tablet. No dark patterns, no pre-selected consent, no burying the explanation in small print under a big "Continue" button. The vernacular explanation is not a compliance checkbox to rush through — it's the most important 30 seconds in the entire flow. Language should say "this helps you get credit," not "you are being assessed."

**Everything, everywhere: redundant signaling, never color alone.** Risk tiers, sync status, and flags must be color + icon + text together. Not because of a design trend — because a semi-literate user in bright sunlight looking at a possibly color-shifted screen cannot be expected to distinguish amber from red reliably. Color-only status indicators are a real accessibility failure here, not a nitpick.

---

## 3. Information Architecture — What Goes Where

### Field Officer PWA (in order of appearance)
1. **Login — phone + PIN, not a password.** Numeric keypad, large-digit touch targets (same 48dp minimum as everything else), because this happens outdoors on a tablet, possibly with a dirty or gloved finger, before the officer has even started their actual work. A cached session should carry across app restarts so this isn't repeated per visit — re-authentication should only be prompted at sync time if the token has actually expired, not reflexively on every launch. **Open gap, not yet resolved:** what happens if an officer forgets their PIN mid-route with no connectivity to reset it — this needs an answer before build, not during it.
2. Home — sync status badge, New/Existing Enterprise
3. Cluster selector — 3 large, icon-led cards (Dairy / Kirana / Handicraft), not a dropdown. A dropdown here is a UX regression when the choice set is 3 items and the user's hands may be dirty or gloved
4. Registration — minimal fields, autosave every field as typed, not on submit
5. Consent — full-screen video, unmissable affirmative action, no way to skip
6. Proxy entry — one cluster-specific field group per screen section, not a giant single-scroll form; large numeric steppers over free-text number entry where possible (fewer keyboard errors)
7. Forecast + explanation — the number, the tier, the plain-language reason, the audio button, in that visual hierarchy — the tier is the biggest thing on screen, not the smallest
8. Confirm/Override — **its own full screen**, not a footer button on the forecast screen. This decision is too important to be a secondary action bar item. Override requires a visibly separate, deliberately-not-default-styled path (not the same button color as Confirm) with a mandatory reason field that's a real text area, not a cramped one-line input

### Institution Dashboard
1. Portfolio overview — "needs attention today" list first, above any chart
2. Risk view — filterable by cluster/district/tier, not a static heatmap image
3. Discrepancy log — sortable table, plain-language reason column visible without a click
4. Enterprise detail — full visit history, one continuous timeline, not tabs hiding half the record
5. Audit trail — searchable, exportable, boring by design — this screen should look like a ledger, not a product feature

---

## 4. Visual System — Built for the Actual Conditions, Not for a Portfolio Screenshot

**Identity — locked, not open for reinvention per screen.** The idea deck already established a real visual identity: deep forest green (`#1F4D36`) as primary, ochre/terracotta (`#C97C3D`) as accent, deep navy (`#0B1F3A`) for high-authority moments like the closing/consent framing, paired with a serif display face for headlines and a clean sans for body and UI text, plus an icon-in-circle motif for anything representing a category (sector, action type, status). **The product should carry this identity, not invent a second one.** A judge who saw the deck and then sees screenshots or a live demo in an unrelated visual language will read it as two different projects, or worse, as the deck being aspirational marketing disconnected from what was actually built. Reuse the palette and motif; don't restart from a generic Material/Tailwind default because the deck and the app were built by different tools.

**Color:** high-contrast palette, WCAG AA minimum (4.5:1 for body text, 3:1 for large text) — this isn't optional given outdoor glare. Risk tiers use a traffic-light metaphor (widely understood cross-literacy) but never color alone — pair with a shape/icon (circle/triangle/square, not just hue) so a colorblind or glare-affected view still communicates the tier.

**Type:** a single highly legible sans-serif at a generous scale — this is not the screen to make a typography statement, it's the screen to make sure a tired officer at 4pm in the sun reads the risk tier correctly the first time. Minimum 18px body on the field PWA, larger for the risk tier and forecast numbers specifically since those are the decision-critical elements.

**Motion:** minimal, functional only — a loading state needs to say what's loading ("Generating forecast…" not a bare spinner), not decorative animation. On a low-end tablet, unnecessary animation is also a performance cost, not just a taste question.

**Iconography:** simple, universally legible glyphs (not clever custom icons) — a cow icon for dairy, a shop icon for kirana, a loom/thread icon for handicraft. Recognizable at a glance, works across literacy levels.

**Sync/offline status:** always visible, always in the same place (top of screen), plain language ("Saved on this device" / "Syncing…" / "Synced") — never a bare icon with no text, since the consequence of misreading this status is a lost visit.

---

## 5. Content & Voice — Per the Actual Audience, Not Generic Copy

- **Field officer screens:** short, active-voice instructions in the vernacular. "Enter milk volume for today," not "Please provide the daily milk yield figure." Buttons say exactly what happens: "Save and continue," not "Submit," and the confirmation after tapping it uses the same word ("Saved"), not a different one.
- **Consent screen:** first-person, plain language, no legal jargon translated literally — "We'll use this information to help you get a loan. You can say no." Not a translated version of a DPDP clause.
- **Risk explanations:** the plain-language sentence already specified in the TRD is the right register — concrete, specific, no hedging language, no "may potentially indicate."
- **Dashboard:** can be denser and more technical — this audience wants precision, not simplification. Don't over-simplify for admins the way you correctly simplify for field officers; they're different audiences with different needs, not the same audience at different screen sizes.
- **Empty/error states:** state what happened and what to do next, in the interface's voice. "No signal. Your data is saved and will sync automatically." Not "Oops! Something went wrong 😅" — this is a credit tool, not a consumer app, and false cheerfulness reads as untrustworthy in this context specifically.

---

## 6. Anti-Patterns — What Not to Build, Named Directly

1. **A glassy, rounded-card, gradient-accented "modern fintech" dashboard applied to the field officer app.** This aesthetic is designed for a seated person on a laptop in an office. It is actively wrong for someone standing outdoors making a fast decision. If your field officer screens look like a Series A pitch deck, that's a mismatch, not a strength.
2. **Color-only risk indicators.** Covered above — this is a real accessibility failure in this specific context, not a style preference.
3. **A single giant scrolling form for proxy entry.** Cognitive overload for a non-technical user standing up. Break it into deliberate steps.
4. **Confirm/Override as a footer button instead of its own screen.** The single highest-stakes interaction in the product should not be visually equivalent to "Next."
5. **A dashboard that prioritizes chart variety over the "what needs attention today" list.** Judges and admins both want to see you understand the difference between an impressive-looking screen and a useful one.
6. **Cutesy microcopy, mascots, or playful error states.** Wrong register for a credit-decisioning tool used by BCs and reviewed by regulators.
7. **Treating the consent screen as a formality UI element instead of the most important interaction with the actual human being assessed.** If this screen gets the least design attention because it's "just consent," that's backwards — it's the one screen where getting the tone wrong causes real harm, not just a bad review.
8. **Building the product's visual identity from scratch, disconnected from the deck.** The palette and motif already exist and are already good — reinventing them per-screen or defaulting to whatever a component library ships with by default reads as two teams that didn't talk to each other, not as fresh thinking.

---

## 7. What to Actually Show on Demo Day

Given time constraints, the field officer flow (cluster select → proxy entry → forecast → confirm/override) needs full visual polish — it's what's on screen for 80% of the pitch. The dashboard needs to look credible in a 20-second cut, not be fully-featured — one clean portfolio view and one discrepancy log row expanded is enough; don't build five dashboard screens if only one gets shown. Match design effort to demo airtime, not to feature list length.
