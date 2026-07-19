-- Udyam Sahayak — Core Database Schema (Gate 1)
-- Strictly per backend_schema_final.md & PRD_final.md

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Institutions
CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Officers
CREATE TABLE IF NOT EXISTS officers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Clusters
CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE CHECK (name IN ('Dairy', 'Kirana / Rural Retail', 'Handicraft')),
    uses_climate BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enterprises
CREATE TABLE IF NOT EXISTS enterprises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL UNIQUE, -- Idempotency key generated on-device
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE RESTRICT,
    owner_name TEXT NOT NULL,
    village TEXT,
    district TEXT,
    state TEXT,
    officer_id UUID NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
    client_submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    server_received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Consents
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL UNIQUE, -- Idempotency key generated on-device
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
    method TEXT NOT NULL CHECK (method IN ('biometric', 'recorded_voice')),
    language TEXT NOT NULL CHECK (language IN ('hi', 'te', 'ta', 'en')),
    consent_token TEXT NOT NULL,
    officer_id UUID NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
    client_submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    server_received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Proxy Records
CREATE TABLE IF NOT EXISTS proxy_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_record_uuid UUID NOT NULL UNIQUE, -- Idempotency key generated on-device
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
    officer_id UUID NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
    visit_date DATE NOT NULL,
    client_submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    server_received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    physical_proxies JSONB NOT NULL,
    bounds_validated BOOLEAN NOT NULL DEFAULT FALSE,
    self_reported_signal NUMERIC,
    climate_snapshot JSONB,
    forecast_result JSONB,
    discrepancy JSONB,
    officer_action TEXT CHECK (officer_action IN ('CONFIRM', 'OVERRIDE')),
    override_reason TEXT,
    sync_status TEXT NOT NULL CHECK (sync_status IN ('draft', 'pending', 'synced', 'conflict')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Cluster Models (m2cgen JS & baseline/templates cache)
CREATE TABLE IF NOT EXISTS cluster_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    forecast_model_js TEXT NOT NULL,
    risk_model_js TEXT NOT NULL,
    baseline_json JSONB NOT NULL,
    templates_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(cluster_id, version)
);

-- 8. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    actor_id UUID REFERENCES officers(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance & query patterns
CREATE INDEX IF NOT EXISTS idx_enterprises_institution ON enterprises(institution_id);
CREATE INDEX IF NOT EXISTS idx_enterprises_cluster ON enterprises(cluster_id);
CREATE INDEX IF NOT EXISTS idx_proxy_records_enterprise ON proxy_records(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_proxy_records_officer ON proxy_records(officer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
