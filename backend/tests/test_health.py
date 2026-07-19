"""Tests for system health check endpoint."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "ok"]
    assert data["service"] == "kisan-credit-copilot-backend"
    assert data["gate"] == 3
