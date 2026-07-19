-- Udyam Sahayak — Row Level Security (RLS) Policies (Gate 1)
-- Strictly per backend_schema_final.md & SECURITY_final.md

-- Enable RLS on all tables
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE proxy_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to extract institution_id from current JWT context or current_setting
CREATE OR REPLACE FUNCTION get_current_institution_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('jwt.claims.institution_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_officer_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('jwt.claims.sub', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Institutions: Officers can view only their own institution
CREATE POLICY institutions_select_policy ON institutions
    FOR SELECT USING (id = get_current_institution_id() OR current_setting('jwt.claims.role', true) = 'service_role');

-- 2. Officers: Officers can view active officers within their institution
CREATE POLICY officers_select_policy ON officers
    FOR SELECT USING (institution_id = get_current_institution_id() OR current_setting('jwt.claims.role', true) = 'service_role');

-- 3. Clusters: Clusters are globally readable across all institutions
CREATE POLICY clusters_select_policy ON clusters
    FOR SELECT USING (true);

-- 4. Enterprises: Tenant isolation by institution_id
CREATE POLICY enterprises_select_policy ON enterprises
    FOR SELECT USING (institution_id = get_current_institution_id() OR current_setting('jwt.claims.role', true) = 'service_role');

CREATE POLICY enterprises_insert_policy ON enterprises
    FOR INSERT WITH CHECK (institution_id = get_current_institution_id() OR current_setting('jwt.claims.role', true) = 'service_role');

-- 5. Consents: Read/Write if parent enterprise belongs to officer's institution
CREATE POLICY consents_select_policy ON consents
    FOR SELECT USING (
        enterprise_id IN (SELECT id FROM enterprises WHERE institution_id = get_current_institution_id())
        OR current_setting('jwt.claims.role', true) = 'service_role'
    );

CREATE POLICY consents_insert_policy ON consents
    FOR INSERT WITH CHECK (
        enterprise_id IN (SELECT id FROM enterprises WHERE institution_id = get_current_institution_id())
        OR current_setting('jwt.claims.role', true) = 'service_role'
    );

-- 6. Proxy Records: Tenant isolation & strict immutability post-finalization
CREATE POLICY proxy_records_select_policy ON proxy_records
    FOR SELECT USING (
        enterprise_id IN (SELECT id FROM enterprises WHERE institution_id = get_current_institution_id())
        OR current_setting('jwt.claims.role', true) = 'service_role'
    );

CREATE POLICY proxy_records_insert_policy ON proxy_records
    FOR INSERT WITH CHECK (
        enterprise_id IN (SELECT id FROM enterprises WHERE institution_id = get_current_institution_id())
        OR current_setting('jwt.claims.role', true) = 'service_role'
    );

-- IMMUTABILITY ENFORCEMENT: Can only update if officer_action is currently NULL (unconfirmed/draft)
CREATE POLICY proxy_records_update_policy ON proxy_records
    FOR UPDATE USING (
        (enterprise_id IN (SELECT id FROM enterprises WHERE institution_id = get_current_institution_id()) AND officer_action IS NULL)
        OR current_setting('jwt.claims.role', true) = 'service_role'
    );

-- 7. Cluster Models: Globally readable by active officers
CREATE POLICY cluster_models_select_policy ON cluster_models
    FOR SELECT USING (is_active = true OR current_setting('jwt.claims.role', true) = 'service_role');

-- 8. Audit Logs: Read/write by service_role or insert by current officer
CREATE POLICY audit_logs_insert_policy ON audit_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY audit_logs_select_policy ON audit_logs
    FOR SELECT USING (current_setting('jwt.claims.role', true) = 'service_role');
