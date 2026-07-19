# Technical Requirements Document
## Udyam Sahayak

## 1. Architecture — Three Pillars

```
PILLAR 1: DATA COLLECTION       PILLAR 2: INTELLIGENCE ENGINE        PILLAR 3: DELIVERY
Field Officer PWA (offline)  →  m2cgen-transpiled XGBoost (JS)   →   Institution Dashboard
- Proxy capture                 - Forecast + risk tier                - Risk heatmap
- Consent capture (idempotent)  - Deterministic explanation           - Trends
- Draft-state, then confirmed     (static templates)                  - Discrepancy log
- Offline queue, idempotent                                           - Audit trail
  sync
```

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + Vite, Workbox Service Worker | Offline-first PWA, sub-3s cold load |
| Local storage | IndexedDB | Structured offline store, sufficient capacity |
| On-device inference | m2cgen-transpiled XGBoost → pure JS | 30–80KB per cluster, no runtime deps, avoids WASM cold-start. Requires an explicit missing-value sanitization layer (§4.4) — this is tested before any other feature work begins. |
| Server-side training | Python — XGBoost, scikit-learn, pandas | Fits sparse tabular rural data |
| Explanation | Static template text, authored and frozen before build | Fully deterministic, zero runtime dependency, zero non-determinism |
| Audio | Pre-rendered MP3, fetched per active cluster/language only | Keeps initial cache small; see §6 for the actual size budget |
| Backend API | FastAPI | Async, matches ML stack |
| Auth | JWT (15min access + refresh), phone+PIN login, officer_id derived server-side from token claim — never trusted from request body | Closes the API-forgery gap; see SECURITY_final.md §2 |
| Database | PostgreSQL via Supabase | Managed auth (phone/OTP), auto-generated CRUD via PostgREST, RLS built in — decided over a direct Postgres+FastAPI-only setup specifically to save build hours on login/CRUD boilerplate; FastAPI still owns inference, discrepancy, and sync endpoints |
| Dashboard | React + Recharts | Sufficient for hackathon scale |

## 3. Data Flow

**Offline path:** officer opens cached PWA → creates/selects enterprise (idempotency key generated) → consent captured (idempotency key generated) → proxies entered → model runs on-device (<50ms, after sanitization) → explanation template fills → record saved locally as a **draft** (no officer action yet) → officer reviews and confirms/overrides → draft is updated in place and marked ready to sync.

**Sync path:** on reconnect, only records with a completed officer action are ever queued for sync — drafts never leave the device. Each queued record carries its idempotency key; the server treats a repeated key as a no-op, not a new row.

## 4. ML Model Specification

### 4.1 Per-cluster models
Separate XGBoost regressor + classifier per cluster (dairy, kirana, handicraft) — feature sets and baselines differ materially between sectors. `n_estimators=100`, `max_depth=6` keeps transpiled JS under ~80KB and execution under 50ms.

### 4.2 Feature sets
Cluster-specific physical proxies (dairy: livestock/milk/fodder/electricity/workers/equipment; kirana: floor area/SKUs/restock frequency/electricity/workers; handicraft: artisans/looms/raw material value/electricity/days-since-order), and a bounded climate modifier for agri-clusters only.

### 4.3 Model bundle
```
/models/{cluster}/forecast_model.js   # m2cgen regressor
/models/{cluster}/risk_model.js       # m2cgen classifier
/models/{cluster}/baseline.json       # expected-range parameters
/models/{cluster}/templates.json      # static explanation text
/models/{cluster}/audio/{lang}/*.mp3  # fetched lazily, active language only
```

### 4.4 Missing-value handling — must be verified before other feature work

XGBoost learns a default split direction for missing values at training time. Transpiled JS from m2cgen does not automatically preserve this in every code path — a raw `if (value > threshold)` comparison against `undefined`/`NaN` in JavaScript evaluates falsy and can silently take the wrong branch, producing a plausible-looking but wrong forecast with no error.

**Required, day one:**
1. Inspect the actual generated `.js` file for a trained model — confirm whether it emits an explicit `Number.isNaN(x)` check per split, or not.
2. Build a sanitization wrapper that runs before every inference call, substituting the exact sentinel the model was trained to treat as missing for any blank officer input.
3. Test against a deliberately incomplete proxy record before building anything on top of the inference path. **If step 1 shows the generated tree does not handle missing values correctly, the fallback — decided now, not on demo day — is training on median-imputed features and imputing client-side before inference, skipping missing-value splits entirely.**

## 5. Bounds Validation — a Different Problem Than Missing Values

Missing-value sanitization (§4.4) only catches blank fields. It does not catch a field that's technically valid but physically impossible for an active enterprise — a Kirana shop with `floor_area_sqft = 0`, or a dairy record with `livestock_count = 0`. A literal zero is not falsy in a numeric comparison and passes straight through the sanitizer, so the model runs on nonsense inputs and produces a plausible-looking but meaningless forecast.

**Fix, a separate validation pass:** each cluster's `baseline.json` defines a minimum physically-plausible value per required proxy field (an operating dairy has ≥1 cow, an operating retail shop has floor area >0). Before inference, every value is checked against this bound. Anything below it blocks the forecast screen with a re-entry prompt naming the implausible field, rather than silently producing a low-confidence result. `proxy_records.bounds_validated` is set `true` only if every field cleared this check, so the dashboard can distinguish a genuinely low-activity enterprise from a data-entry error.

## 6. Audio Bundle — Actual Size Budget

Only the officer's active cluster and language are cached, not the full cross-product of clusters × languages. For one cluster, one language: roughly 20–30 short template phrases at ~50KB each ≈ 1–1.5MB. This is fetched and cached once the officer selects a cluster, not at PWA cold-load — cold-load only needs the app shell and the cluster selector, which is what the <3s target actually measures. Switching cluster or language mid-session triggers a small additional fetch, not a multi-megabyte reload.



## 8. Deterministic Explanation — What It Actually Is

Fixed template text per feature/direction/cluster/language, selected by matching the model's feature importances, filled at runtime, never generated at runtime. Same inputs always produce the same output. This is a simplicity choice made specifically to avoid non-determinism in a credit-adjacent decision — worth stating plainly rather than dressed up as anything more sophisticated.

## 9. Confirm/Override — Enforcement, Precisely

- **Client:** the PWA blocks navigation past the review screen without an explicit action. This is where human review actually happens.
- **Schema:** `officer_action` is a required column with a CHECK constraint — a row cannot exist without a value, and an OVERRIDE cannot exist without a reason. This guarantees the record is permanent and traceable once created; it does not and cannot verify that a human, rather than a direct API call, produced the value. If asked: the schema enforces record integrity, not request authenticity — request-level authentication binding an action to an authenticated officer session is a natural next step beyond hackathon scope.

## 10. Immutability

Once `forecast_result`, `discrepancy`, and `officer_action` are written, they cannot be updated. Enforced via Row Level Security, since the stack is Supabase/PostgREST — connecting roles are `anon`/`authenticated`, not a custom database role, so RLS is the only mechanism that actually applies:

```sql
ALTER TABLE proxy_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY proxy_records_no_update_after_action ON proxy_records
  FOR UPDATE TO authenticated
  USING (officer_action IS NULL);  -- only drafts (no action yet) can be updated
```
No separate REVOKE-based branch, no trigger — one mechanism, decided, matching the one stack this is actually being deployed on.

## 11. Non-Functional Targets

| Requirement | Target |
|---|---|
| Model execution (pure JS) | < 50ms |
| End-to-end proxy-to-render | < 2s |
| PWA cold load (app shell only) | < 3s on 3G-equivalent throttling |
| Active cluster/language audio fetch | ~1–1.5MB, on cluster selection, not cold load |
| Sync batch size | 10 records |
| Duplicate rows under retried sync | Zero, across enterprises, consents, and assessments |
| Updates against finalized forecast_result/discrepancy/officer_action | Zero |

## 12. Demo Flow

Beat sheet, not a stopwatch transcript — rehearse until the sequence is automatic, not until timestamps match exactly:

1. Problem context — rural credit gap, why human review matters (30s)
2. Architecture overview (15s)
3. Officer logs in (phone + PIN) — quick, not dwelt on; establishes that every following action is attributable to this authenticated session
4. Live, offline: new enterprise → consent → proxies → forecast in < 2s, timer visible
5. Explanation text + audio plays
6. Officer completes Confirm/Override live — narrate: "this record cannot be finalized without this action"
8. **Sync idempotency: play the single pre-recorded terminal clip** showing a duplicate request returning 200 OK with zero new rows. This is the only sync-idempotency demonstration in the pitch — not repeated live anywhere else.
9. **Dashboard — optional, cut first if time is short.** Per the execution checklist's blast-radius test: if this is removed the night before judging, the core demo still works. One clean screen if time allows; do not build this at the expense of steps 3–8.
10. Q&A — prepared, direct answers ready for: "why static templates instead of an LLM," "how was this threshold set," "what stops someone from calling your API directly," "what exactly do you mean by RBI MRM alignment" (answer: specific principles — human review, explainability, traceability, reproducibility, record integrity — not full regulatory compliance)
