# App Flow
## Udyam Sahayak

## 1. Field Officer PWA — Primary Flow

```
[Launch] → Service Worker cache load (app shell only, <3s)
   │
   ▼
Login — phone + PIN, cached JWT reused across the session
   → offline-tolerant: a previously-valid cached token lets the officer keep
     working without a fresh login if reconnection hasn't happened yet;
     sync itself is what actually requires a valid, non-expired token
   → officer_id is never entered or stored by the officer — it's derived
     server-side from the token at sync time, exactly as specified in
     TRD §2 and backend_schema_final.md's officers table
   │
   ▼
Home: "New Enterprise" | "Existing Enterprise" | Sync status badge
   │
   ▼
Cluster Selector (Dairy / Kirana / Handicraft)
   → triggers lazy fetch of that cluster's model + templates + active-language audio
   │
   ▼
Enterprise Registration (owner, village, district, state)
   → client_id generated on-device, written to local_enterprises
   │
   ▼
Consent Screen
   → vernacular video, biometric or recorded-voice affirmative action
   → client_id generated on-device, written to local_consents
   → blocks forward navigation until captured
   │
   ▼
Physical Proxy Entry (5–7 cluster-specific fields, self-reported signal optional)
   │
   ▼
[Automatic] Sanitize inputs → run on-device model (<50ms) → run expected-range check →
            fill explanation template → write result to local_proxy_records as a DRAFT
            (officer_action = NULL, sync_status = 'draft')
   │
   ▼
Forecast Screen — range, confidence, risk tier, feature importances, discrepancy banner if flagged
   │
   ▼
Confirm / Override — required to proceed
   → OVERRIDE requires a typed reason
   → updates the same draft record in place: officer_action set, sync_status → 'pending'
   → only now does the record enter sync_queue
   │
   ▼
"Saved offline. Will sync when connected."
```

**Existing enterprise:** search/list → same flow from Physical Proxy Entry onward, for a new visit.

## 2. Resume Flow

```
Officer relaunches PWA after an interruption
   │
   ▼
Any local_proxy_records with sync_status = 'draft'?
   │
   ├── No  → normal Home screen
   └── Yes → "Resume assessment for {enterprise}?" → opens directly at the
              Confirm/Override screen with the forecast already computed
```
A draft never enters `sync_queue`. An interrupted session produces a resumable local draft, not a server-side enterprise/consent pair with no matching assessment.

## 3. Sync Flow

```
Connectivity detected
   │
   ▼
Cached JWT still valid?
   │
   ├── No  → prompt re-login before draining queue; records stay safely
   │          queued locally, nothing is lost or sent unauthenticated
   └── Yes → Service Worker drains sync_queue (batches of 10) — contains only records
             past the draft stage, by construction
   │
   ▼
POST /sync with client-generated keys for enterprises, consents, and proxy_records
   │
   ▼
Server checks each key against its table's UNIQUE constraint:
   new key → insert, mark synced
   known key (retry) → no-op, mark synced, zero duplicate row
   │
   ▼
audit_logs entry written: event_type = 'SYNCED'
```

## 4. Institution Dashboard Flow

```
Login (JWT)
   │
   ▼
Portfolio Overview — risk heatmap, forecast trends, sync status widget
   │
   ├── Discrepancy Log — flagged records, expected range, reported value, resolution status
   ├── Enterprise Detail — full visit history: every forecast, every flag, every officer action
   └── Audit Trail — searchable, read-only (no update/delete privilege for the app role)
```

## 5. Confirm/Override — What's Enforced Where

- **Client:** navigation is blocked past this screen without an action. This is where human review actually happens.
- **Server/schema:** once an action is recorded, it's permanent (§10 of the TRD) and traceable, and an OVERRIDE cannot exist without a reason. The schema proves the record's integrity, not the identity of whoever sent the request — those are different guarantees, and the team should state that distinction directly if asked rather than blur it.

Do not attempt to demonstrate an API-bypass or a live sync retry on stage — see TRD §12 for the single, pre-recorded proof of idempotency used in the demo.

## 6. Screen-to-Table Map

| Screen | Writes to | Idempotency key |
|---|---|---|
| Login | JWT cached locally, no local write | — (auth is stateless per-token, not idempotency-keyed) |
| Enterprise Registration | `local_enterprises` → `enterprises` | `client_id` |
| Consent Capture | `local_consents` → `consents` | `client_id` |
| Physical Proxy Entry + Forecast (draft) | `local_proxy_records` (draft) | `client_record_uuid` |
| Confirm/Override | `local_proxy_records` → `proxy_records` (finalized) | `client_record_uuid` |
| Dashboard | read-only | — |
