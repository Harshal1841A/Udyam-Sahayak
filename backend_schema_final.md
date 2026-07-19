# Backend Schema
## Udyam Sahayak

## 1. Entity Relationship Overview

```
institutions ──< enterprises >── clusters
enterprises ──< consents            (idempotency key: client_id, UNIQUE)
enterprises ──< proxy_records       (idempotency key: client_record_uuid, UNIQUE;
                                      officer_action required by CHECK once finalized;
                                      forecast_result/discrepancy/officer_action protected
                                      from update via column-level REVOKE, not a trigger)
all actions ──> audit_logs          (insert-only privilege for the app role)
```

6 tables, 4 foreign keys.

## 2. PostgreSQL DDL

```sql
CREATE TABLE institutions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    region      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replaces raw officer_name TEXT columns across enterprises/consents/proxy_records.
-- Fixes a real gap: string-identifier drift ("Amit Patel" vs "amit patel") silently
-- fragments the audit trail. Cheap to add now; expensive to retrofit later.
CREATE TABLE officers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id  UUID NOT NULL REFERENCES institutions(id),
    name            TEXT NOT NULL,
    phone           TEXT NOT NULL UNIQUE,
    pin_hash        TEXT NOT NULL,           -- bcrypt/argon2 — see SECURITY_final.md §2
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clusters (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,               -- 'Dairy', 'Kirana / Rural Retail', 'Handicraft'
    uses_climate   BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE enterprises (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL UNIQUE,        -- idempotency key, generated on-device
    institution_id  UUID NOT NULL REFERENCES institutions(id),
    cluster_id      UUID NOT NULL REFERENCES clusters(id),
    owner_name      TEXT NOT NULL,
    village         TEXT,
    district        TEXT,
    state           TEXT,
    officer_id            UUID NOT NULL REFERENCES officers(id),
    client_submitted_at   TIMESTAMPTZ NOT NULL,   -- device clock, informational only, not trusted for ordering
    server_received_at    TIMESTAMPTZ NOT NULL DEFAULT now()  -- authoritative for audit/analytics
);

CREATE TABLE consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL UNIQUE,        -- idempotency key
    enterprise_id   UUID NOT NULL REFERENCES enterprises(id),
    method          TEXT NOT NULL CHECK (method IN ('biometric', 'recorded_voice')),
    language        TEXT NOT NULL CHECK (language IN ('hi', 'te', 'ta')),
    consent_token   TEXT NOT NULL,
    officer_id            UUID NOT NULL REFERENCES officers(id),
    client_submitted_at   TIMESTAMPTZ NOT NULL,
    server_received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE proxy_records (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_record_uuid    UUID NOT NULL UNIQUE,   -- idempotency key
    enterprise_id         UUID NOT NULL REFERENCES enterprises(id),
    officer_id             UUID NOT NULL REFERENCES officers(id),
    visit_date             DATE NOT NULL,
    client_submitted_at    TIMESTAMPTZ NOT NULL,   -- device clock, informational only
    server_received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- authoritative for ordering/analytics

    physical_proxies      JSONB NOT NULL,
    bounds_validated       BOOLEAN NOT NULL DEFAULT false,  -- see TRD §5 — true only if every
                                                              -- proxy field passed cluster-specific
                                                              -- physical-plausibility bounds, not just
                                                              -- null/undefined sanitization
    self_reported_signal  NUMERIC,
    climate_snapshot      JSONB,                  -- NULL for non-agri clusters

    forecast_result       JSONB,                  -- NULL while status='draft'; required once finalized
    discrepancy           JSONB,                  -- {flagged, expected_range, reported_value,
                                                    --  multiple, reason} or NULL

    officer_action         TEXT CHECK (officer_action IN ('CONFIRM','OVERRIDE')),  -- NULL only while draft
    override_reason         TEXT,
    CONSTRAINT override_requires_reason CHECK (
        officer_action IS DISTINCT FROM 'OVERRIDE' OR override_reason IS NOT NULL
    ),

    sync_status            TEXT NOT NULL DEFAULT 'draft'
                            CHECK (sync_status IN ('draft','pending','synced','conflict')),
    CONSTRAINT finalized_requires_action CHECK (
        sync_status = 'draft' OR officer_action IS NOT NULL
    ),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security, not REVOKE — decided because the stack is Supabase/
-- PostgREST, where the connecting roles are anon/authenticated, not a
-- custom database role a REVOKE statement could target.
ALTER TABLE proxy_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY proxy_records_no_update_after_action ON proxy_records
  FOR UPDATE TO authenticated
  USING (officer_action IS NULL);  -- only drafts (no action yet) can be updated

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id   UUID REFERENCES enterprises(id),
    actor_type      TEXT NOT NULL CHECK (actor_type IN ('AI','OFFICER','SYSTEM')),
    actor_name      TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same reasoning: RLS, not REVOKE, since the stack is Supabase/PostgREST.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_insert_only ON audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);
-- No UPDATE or DELETE policy exists for any role — RLS denies by default
-- for any operation without a matching policy.

CREATE INDEX idx_enterprises_cluster       ON enterprises(cluster_id);
CREATE INDEX idx_proxy_records_enterprise  ON proxy_records(enterprise_id);
CREATE INDEX idx_proxy_records_sync_status ON proxy_records(sync_status) WHERE sync_status IN ('draft','pending');
CREATE INDEX idx_proxy_records_flagged     ON proxy_records((discrepancy->>'flagged')) WHERE (discrepancy->>'flagged') = 'true';
CREATE INDEX idx_audit_enterprise          ON audit_logs(enterprise_id);
```

## 3. Client-Side IndexedDB

| Store | Key | Notes |
|---|---|---|
| `local_enterprises` | `client_id` | Idempotent |
| `local_consents` | `client_id` | Idempotent |
| `local_proxy_records` | `client_record_uuid` | Written as `draft` before review, updated in place on Confirm/Override, then queued |
| `cluster_model_cache` | `cluster_id` | m2cgen JS + baseline + templates; audio fetched separately per active language |
| `sync_queue` | auto-increment | Only ever contains records with `sync_status != 'draft'` |

## 4. What's Enforced Where — Plain Statement

- **Idempotency (no duplicate rows on retry):** database-enforced, via `UNIQUE` on the client-generated key in all three offline-writable tables.
- **Record permanence (no silent overwrite once finalized):** database-enforced, via column-level `REVOKE UPDATE` (or the equivalent RLS policy).
- **A human, specifically, made the Confirm/Override decision:** application/UI-enforced. The database can guarantee the field is present, non-null, and unmodifiable once set — it cannot verify the request's origin. State this plainly if asked; it is not a gap in the design, it is the accurate boundary of what a schema can prove.
- **Draft records never create an orphaned enterprise/consent pair:** enforced by never queuing a `draft` row for sync — this is a client-side sync-queue rule, not a database constraint, and is stated as such.

## 5. Seed Data

```sql
INSERT INTO institutions (name, region) VALUES
('NABARD', 'All India'),
('SBI Rural Branch Latur', 'Maharashtra'),
('Avanti Finance Partner', 'Telangana');

INSERT INTO clusters (name, uses_climate) VALUES
('Dairy', true),
('Kirana / Rural Retail', false),
('Handicraft', false);
```
75-enterprise synthetic dataset (25 per cluster) generated via the Python script in TRD §4, inserted with `client_id` populated so seed data follows the same idempotency pattern as live-entered records.

## 6. Pre-Demo Checklist

- [ ] Confirm both RLS policies (proxy_records, audit_logs) are actually enabled and enforcing — RLS silently does nothing if `ENABLE ROW LEVEL SECURITY` was skipped.
- [ ] Test the m2cgen missing-value path (TRD §4.4) with a deliberately incomplete proxy record.
- [ ] Attempt a manual `UPDATE proxy_records SET forecast_result = ...` after finalization — confirm it fails.
- [ ] Attempt a duplicate insert using an existing `client_id`/`client_record_uuid` — confirm it's rejected or no-ops, not duplicated.
