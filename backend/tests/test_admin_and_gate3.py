import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_admin_portfolio_summary():
    response = client.get("/api/v1/admin/portfolio")
    assert response.status_code == 200
    data = response.json()
    assert "total_enterprises" in data
    assert "active_assessments" in data
    assert "risk_breakdown" in data
    assert "needs_attention_count" in data
    assert "attention_queue" in data
    assert isinstance(data["attention_queue"], list)

def test_admin_discrepancies():
    response = client.get("/api/v1/admin/discrepancies")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_admin_audit_logs():
    response = client.get("/api/v1/admin/audit-logs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_get_cluster_audio():
    # Test valid language for Dairy cluster
    response = client.get("/api/v1/models/active/Dairy/audio/hi")
    assert response.status_code == 200
    data = response.json()
    assert data["cluster_id"] in ["Dairy", "33333333-3333-3333-3333-333333333333"]
    assert data["language"] == "hi"
    assert "दूध उत्पादन" in data["explanation_template"]
    assert data["audio_data_uri"].startswith("data:audio/mp3;base64,")

    # Test another language (Telugu)
    te_resp = client.get("/api/v1/models/active/Dairy/audio/te")
    assert te_resp.status_code == 200
    assert te_resp.json()["language"] == "te"

    # Test invalid language code
    err_resp = client.get("/api/v1/models/active/Dairy/audio/fr")
    assert err_resp.status_code == 400
