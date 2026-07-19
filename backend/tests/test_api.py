import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.services.db_service import init_mock_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_mock_db()

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_officer_login_success():
    response = client.post("/api/v1/auth/login", json={
        "phone": "+919876543210",
        "pin": "1234"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["officer"]["name"] == "Rajesh Kumar (Field Officer)"
    assert data["officer"]["institution_id"] == "11111111-1111-1111-1111-111111111111"

def test_officer_login_failure():
    response = client.post("/api/v1/auth/login", json={
        "phone": "+919876543210",
        "pin": "9999"
    })
    assert response.status_code == 401

def test_get_cluster_model():
    response = client.get("/api/v1/models/cluster/Dairy")
    assert response.status_code == 200
    data = response.json()
    assert data["cluster_id"] == "33333333-3333-3333-3333-333333333333"
    assert data["version"] == "v1.0-dairy"
    assert "score(input)" in data["forecast_model_js"]
    assert "risk_score(input)" in data["risk_model_js"]
    assert "LOW" in data["templates_json"]

def test_get_cluster_model_kirana():
    response = client.get("/api/v1/models/cluster/Kirana / Rural Retail")
    assert response.status_code == 200
    data = response.json()
    assert data["cluster_id"] == "44444444-4444-4444-4444-444444444444"
    assert data["version"] == "v1.0-kirana"
    assert "score(input)" in data["forecast_model_js"]
    assert "risk_score(input)" in data["risk_model_js"]
    assert data["baseline_json"]["base_score"] == 350.0
    assert "LOW" in data["templates_json"]

def test_get_cluster_model_handicraft():
    response = client.get("/api/v1/models/cluster/55555555-5555-5555-5555-555555555555")
    assert response.status_code == 200
    data = response.json()
    assert data["cluster_id"] == "55555555-5555-5555-5555-555555555555"
    assert data["version"] == "v1.0-handicraft"
    assert "score(input)" in data["forecast_model_js"]
    assert "risk_score(input)" in data["risk_model_js"]
    assert data["baseline_json"]["base_score"] == 280.0
    assert "LOW" in data["templates_json"]

def test_sync_batch_workflow_and_immutability():
    # 1. Login to get JWT
    login_resp = client.post("/api/v1/auth/login", json={
        "phone": "+919876543210",
        "pin": "1234"
    })
    token = login_resp.json()["access_token"]
    officer = login_resp.json()["officer"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Idempotency UUIDs
    ent_client_id = str(uuid.uuid4())
    con_client_id = str(uuid.uuid4())
    proxy_client_uuid = str(uuid.uuid4())
    
    # 2. Batch Sync new Enterprise, Consent, and draft Proxy Record
    sync_payload = {
        "officer_id": officer["id"],
        "institution_id": officer["institution_id"],
        "items": [
            {
                "entity_type": "enterprise",
                "idempotency_key": ent_client_id,
                "payload": {
                    "cluster_id": "33333333-3333-3333-3333-333333333333",
                    "owner_name": "Lakshman Singh",
                    "village": "Nagpur Rural",
                    "district": "Nagpur",
                    "state": "Maharashtra",
                    "client_submitted_at": "2026-07-14T08:00:00Z"
                }
            },
            {
                "entity_type": "consent",
                "idempotency_key": con_client_id,
                "payload": {
                    "enterprise_id": ent_client_id,
                    "method": "biometric",
                    "language": "hi",
                    "consent_token": "token-hash-xyz-123",
                    "client_submitted_at": "2026-07-14T08:05:00Z"
                }
            },
            {
                "entity_type": "proxy_record",
                "idempotency_key": proxy_client_uuid,
                "payload": {
                    "enterprise_id": ent_client_id,
                    "visit_date": "2026-07-14",
                    "client_submitted_at": "2026-07-14T08:10:00Z",
                    "physical_proxies": {
                        "livestock_count": 5,
                        "milk_volume_l_day": 40,
                        "fodder_expense_monthly": 4000
                    },
                    "bounds_validated": True,
                    "self_reported_signal": 500.0,
                    "forecast_result": {
                        "predicted_monthly_cash_flow": 490.0,
                        "risk_tier": "LOW",
                        "explanation_text": "Stable cash flow supported by healthy scale."
                    },
                    "officer_action": "CONFIRM",
                    "sync_status": "synced"
                }
            }
        ]
    }
    
    response = client.post("/api/v1/sync/batch", json=sync_payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["synced_count"] == 3
    assert data["conflict_count"] == 0
    assert len(data["results"]) == 3
    
    # 3. Test Idempotency: re-syncing the same enterprise & consent should return synced (idempotent)
    # And re-syncing the finalized proxy record (with officer_action='CONFIRM') should trigger immutability conflict check
    second_sync = client.post("/api/v1/sync/batch", json=sync_payload, headers=headers)
    assert second_sync.status_code == 200
    data2 = second_sync.json()
    # Enterprise & consent are idempotent (synced), proxy record is locked post-finalization (conflict)
    proxy_res = next(r for r in data2["results"] if r["entity_type"] == "proxy_record")
    assert proxy_res["status"] == "conflict"
    assert "Immutable post-finalization" in proxy_res["message"]

def test_sync_batch_officer_mismatch():
    login_resp = client.post("/api/v1/auth/login", json={
        "phone": "+919876543210",
        "pin": "1234"
    })
    token = login_resp.json()["access_token"]
    officer = login_resp.json()["officer"]
    headers = {"Authorization": f"Bearer {token}"}
    
    sync_payload = {
        "officer_id": "forged-officer-id",
        "institution_id": officer["institution_id"],
        "items": []
    }
    
    response = client.post("/api/v1/sync/batch", json=sync_payload, headers=headers)
    assert response.status_code == 403
    assert "does not match" in response.json()["detail"]
