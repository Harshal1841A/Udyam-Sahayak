# Product Requirements Document
## Udyam Sahayak — NABARD Hackathon @ Global Fintech Fest 2026 | Track 03

## 1. Problem

Rural SHGs/FPOs/micro-enterprises lack formal credit histories. No integrated system combines physical ground-truth with cluster-calibrated modeling to forecast cash flow and flag risk early. Manual monitoring misses stress signals until it's too late.

RBI's draft Model Risk Management guidance (June 2026) requires human oversight and explainability for AI-assisted credit decisions. This shapes the architecture: every AI output is reviewed by a field officer before it's finalized, and every decision is traceable to the specific inputs that produced it.

**Timeline this document is scoped against:** idea deck submission first, then a prototype build window of roughly three weeks if shortlisted. Everything in §4 is written for the prototype phase; the idea deck itself only needs to *describe* this convincingly, not have it built. Confusing the two — polishing this document instead of writing code once the prototype window opens — is a known failure mode for this team specifically and is called out here on purpose.

## 2. Goals & Success Metrics

| Goal | Metric | Demo Verification |
|---|---|---|
| Predict cash flow 3–6 months out | End-to-end < 2s, model execution < 50ms | Stopwatch on screen |
| Catch self-reported/proxy mismatches | Flag rate ≥ 80% on synthetic fraud cases | Pre-scripted mismatch case |
| Usable with zero training | Officer completes a full assessment unaided on first attempt | Live walkthrough |
| Every AI output is reviewed and traceable | Every forecast has an attached officer action and a stored explanation | Judge can trace any record's history end to end |
| Works with no connectivity | Full assessment completed offline; syncs on reconnect | Airplane mode live |
| No duplicate records on retry | Idempotency key on every offline-created entity | Recorded terminal clip (not live, see §9) |

## 3. Users

1. **Field Officer / BC (primary).** Android tablet, intermittent connectivity, no data-science background, vernacular UI.
2. **Institution Admin (secondary).** Desktop dashboard — portfolio risk, trends, audit trail.
3. **Enterprise Owner (passive subject).** No app, no login. Interacts only at visit time: consent capture, spoken explanation.

## 4. Scope

### In scope
| # | Feature |
|---|---|
| F1 | Field Officer PWA — offline proxy capture, consent, live forecast, confirm/override |
| F2 | Cluster-calibrated XGBoost (dairy, kirana, handicraft), transpiled to JS via m2cgen for on-device inference |
| F3 | Expected-range check — flags self-reported values that fall well outside what physical proxies predict |
| F4 | Deterministic explanation engine — feature importances mapped to fixed template text, same input always produces same output |
| F5 | Vernacular audio for the officer's active cluster/language only — not the full library upfront |
| F6 | Confirm/Override — officer must act before any record is finalized; the record permanently retains that action once taken |
| F7 | Consent capture — vernacular video + biometric/voice affirmative action, stored with every assessment |
| F8 | Bounded climate/market modifier (±10%, agri-clusters only) — never a standalone predictor |
| F9 | Institution dashboard — risk heatmap, trends, discrepancy log, audit trail |
| F10 | Offline-first sync — idempotent across enterprises, consents, and assessments |
| F11 | Draft-state persistence — an in-progress assessment survives an interrupted session and resumes at the review step, without creating an incomplete server record |
| F12 | Officer authentication — phone + PIN login, JWT-based; every write is attributed server-side to the authenticated officer, never trusted from request body. Missing from earlier drafts of this document despite being required by TRD and the schema since the security pass — added here so scope and requirements stay in sync across documents |

### Scope flexibility — sequenced, not simultaneous
Per the team's execution checklist (Gates 1–6): one cluster fully working end-to-end is the non-negotiable baseline. A second and third cluster (F2) are added only once the first has zero architectural debt — cut the third first if time is short. F9 (institution dashboard) is the first thing cut entirely if behind schedule; the field officer flow, not the dashboard, is what a judge actually needs to see working. This section exists so "in scope" isn't read as "all built simultaneously" — it's a target list, sequenced by the Gate order, not a flat commitment.

### Out of scope
Direct-to-enterprise consumer app, live UPI/Account Aggregator API integration, USSD delivery, satellite imagery as a primary predictor, full three-lines-of-defense governance framework, runtime LLM calls.

## 5. Feature Notes


**F4 — Explanation templates.** Static, hand-authored template text per feature/cluster/language, frozen before build. Deterministic by design: no runtime generation, no non-determinism, no API dependency. This is what makes the explanation reproducible and auditable — not a model feature, a simplicity feature.

**F5 — Audio scope.** Only the currently selected cluster and language's audio set is fetched and cached, not all clusters × all languages. This keeps the initial PWA cache small; a full multi-language, multi-cluster library would be several megabytes and is not required for a single-officer, single-region demo.

**F6 — Confirm/Override.** Enforced two ways: the PWA blocks navigation past this screen without an action (this is where "a human reviewed it" is actually true), and the database permanently records whichever action was taken, with a mandatory reason for overrides. The second guarantee is about permanence and traceability of the record, not proof of who sent the request — that distinction matters and the team should be able to state it plainly if asked.

**F11 — Draft persistence.** Standard local-first UX pattern: an assessment in progress is saved locally before the review step, so an interrupted session resumes cleanly instead of leaving a consent record with no matching assessment.

## 6. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Model execution (pure JS) | < 50ms |
| End-to-end (proxy entry → rendered output) | < 2s |
| PWA cold load (cached, active cluster/language only) | < 3s on 3G-equivalent throttling |
| Audio latency | < 1s from text render to playback |
| Idempotent sync | Zero duplicate rows across all offline-writable entities under retry |
| Immutability | No record's forecast, discrepancy flag, or officer action can be silently overwritten after creation |

## 7. Audit-Ready Architecture — What This Actually Means

This system is built to make specific RBI MRM *principles* checkable in a live system, not to claim full regulatory compliance (MRM compliance requires model validation, backtesting, bias testing, and lifecycle governance well beyond a hackathon prototype). What's actually implemented:

| Principle | What's built |
|---|---|
| Human review before finalization | PWA hard-gates the Confirm/Override screen |
| Explainability | Every forecast stores its feature importances and template-generated explanation at creation time |
| Traceability | Every action (AI inference, officer decision, consent capture) is logged with actor, timestamp, and event type |
| Reproducibility | No runtime randomness — same inputs always produce the same forecast and explanation |
| Record integrity | Once written, a forecast/discrepancy/officer-action cannot be edited — only superseded by a new record |

Calling this "audit-ready architecture aligned with MRM principles" is accurate. Calling it "RBI MRM compliant" is not, and the team should not say the latter in front of a judge with a banking background.

## 8. User Stories

- As a field officer, I complete a full offline assessment and review, and if I lose signal or drop the tablet mid-assessment, I resume where I left off rather than losing the visit.
- As a NABARD admin, I can trace any forecast back to the exact proxy values, feature importances, and officer action that produced it.
- As an enterprise owner, I give consent once per assessment, recorded with a timestamp and method.

## 9. Demo Success Criteria

- [ ] Offline forecast in < 2s, timer visible.
- [ ] Expected-range flag triggers on a pre-scripted mismatch, plain-language reason shown.
- [ ] Officer completes Confirm/Override live — narrate the constraint rather than attempt to break it.
- [ ] Idempotency shown via a **single pre-recorded terminal clip** (not attempted live) — a duplicate sync request returns 200 OK with zero new rows. This is the one and only sync-proof method used anywhere in the demo; it is not repeated as a live action elsewhere in this document or in the technical spec.
- [ ] Judge can trace one record end to end through the audit log.
