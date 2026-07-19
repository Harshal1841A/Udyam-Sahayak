from datetime import datetime, date
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field

class EnterpriseSchema(BaseModel):
    client_id: str = Field(..., description="Idempotency key (UUID generated on-device)")
    institution_id: str
    cluster_id: str
    owner_name: str
    village: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    officer_id: str
    client_submitted_at: datetime

class ConsentSchema(BaseModel):
    client_id: str = Field(..., description="Idempotency key (UUID generated on-device)")
    enterprise_id: str
    method: str = Field(..., description="'biometric' or 'recorded_voice'")
    language: str = Field(..., description="'hi', 'te', 'ta', or 'en'")
    consent_token: str
    officer_id: str
    client_submitted_at: datetime

class ProxyRecordSchema(BaseModel):
    client_record_uuid: str = Field(..., description="Idempotency key (UUID generated on-device)")
    enterprise_id: str
    officer_id: str
    visit_date: Union[date, str]
    client_submitted_at: datetime
    physical_proxies: Dict[str, Any]
    bounds_validated: bool = False
    self_reported_signal: Optional[float] = None
    climate_snapshot: Optional[Dict[str, Any]] = None
    forecast_result: Optional[Dict[str, Any]] = None
    discrepancy: Optional[Dict[str, Any]] = None
    officer_action: Optional[str] = None # 'CONFIRM' or 'OVERRIDE'
    override_reason: Optional[str] = None
    sync_status: str = "pending" # 'draft', 'pending', 'synced', 'conflict'

class ClusterModelBundle(BaseModel):
    cluster_id: str
    version: str
    forecast_model_js: str
    risk_model_js: str
    baseline_json: Dict[str, Any]
    templates_json: Dict[str, Any]
    cached_at: str

class AudioBundle(BaseModel):
    cluster_id: str
    language: str  # 'hi', 'te', 'ta', 'en'
    explanation_template: str
    audio_data_uri: str  # simulated data URI or base64 MP3 for instant offline playback

class AdminPortfolioSummary(BaseModel):
    total_enterprises: int
    active_assessments: int
    risk_breakdown: Dict[str, int]
    needs_attention_count: int

class AdminDiscrepancyItem(BaseModel):
    client_record_uuid: str
    enterprise_id: str
    enterprise_name: str
    cluster_name: str
    visit_date: str
    reported_value: Optional[float] = None
    expected_range: Optional[Dict[str, Any]] = None
    multiple: Optional[float] = None
    reason: Optional[str] = None
    officer_action: Optional[str] = None
    override_reason: Optional[str] = None

class AdminEnterpriseDetail(BaseModel):
    enterprise: Dict[str, Any]
    assessments: List[Dict[str, Any]]
    consents: List[Dict[str, Any]]

class AdminAuditLogItem(BaseModel):
    id: str
    enterprise_id: Optional[str] = None
    actor_type: str
    actor_name: str
    event_type: str
    payload: Optional[Dict[str, Any]] = None
    created_at: str

class SyncQueueItemPayload(BaseModel):
    entity_type: str = Field(..., description="'enterprise', 'consent', or 'proxy_record'")
    idempotency_key: str
    payload: Dict[str, Any]

class SyncBatchRequest(BaseModel):
    officer_id: str
    institution_id: str
    items: List[SyncQueueItemPayload]

class SyncItemResult(BaseModel):
    idempotency_key: str
    entity_type: str
    status: str # 'synced', 'conflict', 'error'
    server_id: Optional[str] = None
    message: Optional[str] = None

class SyncBatchResponse(BaseModel):
    synced_count: int
    conflict_count: int
    error_count: int
    results: List[SyncItemResult]

