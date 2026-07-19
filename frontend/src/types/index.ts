export interface Institution {
  id: string;
  name: string;
  region: string;
  created_at: string;
}

export interface Officer {
  id: string;
  institution_id: string;
  name: string;
  phone: string;
  active: boolean;
  created_at: string;
}

export interface Cluster {
  id: string;
  name: 'Dairy' | 'Kirana / Rural Retail' | 'Handicraft';
  uses_climate: boolean;
  created_at: string;
}

export interface Enterprise {
  id?: string;
  client_id: string; // Idempotency key (UUID generated on-device)
  institution_id: string;
  cluster_id: string;
  owner_name: string;
  village?: string;
  district?: string;
  state?: string;
  officer_id: string;
  client_submitted_at: string;
  server_received_at?: string;
  gps_lat?: number;
  gps_lng?: number;
  gps_accuracy?: number;
}

export interface Consent {
  id?: string;
  client_id: string; // Idempotency key (UUID generated on-device)
  enterprise_id: string;
  method: 'biometric' | 'recorded_voice';
  language: 'hi' | 'te' | 'ta' | 'en';
  consent_token: string;
  officer_id: string;
  client_submitted_at: string;
  server_received_at?: string;
}

export interface DairyPhysicalProxies {
  livestock_count: number;
  milk_volume_l_day: number;
  fodder_expense_monthly?: number;
  electricity_bill_monthly?: number;
  workers_count?: number;
  equipment_value?: number;
}

export interface KiranaPhysicalProxies {
  floor_area_sqft: number;
  skus_count: number;
  restock_freq_monthly: number;
  electricity_bill_monthly?: number;
  workers_count?: number;
}

export interface HandicraftPhysicalProxies {
  artisans_count: number;
  looms_equipment_count: number;
  raw_material_expense_monthly: number;
  electricity_bill_monthly?: number;
  days_since_last_order?: number;
}

export interface DiscrepancyResult {
  flagged: boolean;
  expected_range?: [number, number];
  reported_value?: number;
  multiple?: number;
  reason?: string;
}

export interface ForecastResult {
  predicted_monthly_cash_flow: number;
  confidence_interval: [number, number];
  risk_tier: 'LOW' | 'MEDIUM' | 'HIGH';
  feature_importances: Record<string, number>;
  explanation_text: string;
  execution_time_ms: number;
}

export interface ProxyRecord {
  id?: string;
  client_record_uuid: string; // Idempotency key (UUID generated on-device)
  enterprise_id: string;
  officer_id: string;
  visit_date: string;
  client_submitted_at: string;
  server_received_at?: string;
  physical_proxies: DairyPhysicalProxies | KiranaPhysicalProxies | HandicraftPhysicalProxies | Record<string, any>;
  bounds_validated: boolean;
  self_reported_signal?: number;
  climate_snapshot?: Record<string, any>;
  forecast_result?: ForecastResult;
  discrepancy?: DiscrepancyResult;
  officer_action?: 'CONFIRM' | 'OVERRIDE' | string;
  override_reason?: string;
  risk_tier?: string;
  applied_modifier?: number;
  sync_status: 'draft' | 'pending' | 'synced' | 'conflict';
  created_at?: string;
}

export interface ClusterModelCache {
  cluster_id: string;
  forecast_model_js: string;
  risk_model_js: string;
  baseline_json: Record<string, any>;
  templates_json: Record<string, any>;
  cached_at: string;
}

export interface SyncQueueItem {
  id?: number;
  entity_type: 'enterprise' | 'consent' | 'proxy_record';
  payload: Enterprise | Consent | ProxyRecord;
  idempotency_key: string;
  queued_at: string;
  retry_count: number;
}

export interface AudioBundle {
  cluster_id: string;
  language: 'hi' | 'te' | 'ta' | 'en';
  explanation_template: string;
  audio_data_uri: string;
}

export interface AdminPortfolioSummary {
  total_enterprises: number;
  active_assessments: number;
  total_assessed: number;
  risk_breakdown: Record<string, number>;
  needs_attention_count: number;
  attention_queue: Array<{
    client_record_uuid: string;
    enterprise_id: string;
    owner_name: string;
    village?: string;
    cluster_name: string;
    visit_date: string;
    risk_tier: string;
    is_flagged: boolean;
    sync_status: string;
    discrepancy_reason?: string;
  }>;
}

export interface AdminDiscrepancyItem {
  client_record_uuid: string;
  enterprise_id: string;
  enterprise_name: string;
  cluster_name: string;
  visit_date: string;
  reported_value?: number;
  expected_range?: { min: number; max: number };
  multiple?: number;
  reason?: string;
  officer_action?: string;
  override_reason?: string;
}

export interface AdminEnterpriseDetail {
  enterprise: Enterprise & { cluster_name?: string };
  assessments: ProxyRecord[];
  consents: Consent[];
}

export interface AdminAuditLogItem {
  id: string;
  enterprise_id?: string;
  actor_type: 'AI' | 'OFFICER' | 'SYSTEM';
  actor_name: string;
  event_type: string;
  payload?: any;
  created_at: string;
}

