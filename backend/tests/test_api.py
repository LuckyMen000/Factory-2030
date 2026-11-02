"""Basic API smoke/regression tests for the H1 QR pilot."""
import pytest
from fastapi.testclient import TestClient
import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_FILE", tmp_path / "test-maintenance.db")
    main.init_db()
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_demo_equipment_and_qr(client):
    items = client.get("/api/equipment")
    assert items.status_code == 200
    assert len(items.json()) == 4
    qr = client.get("/api/equipment/1/qr", params={"base_url": "https://example.com/Factory-2030"})
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/png")
    assert qr.content.startswith(b"\x89PNG")


def test_ticket_and_stats(client):
    payload = {
        "equipment_id": 1,
        "title": "Не запускается станок",
        "description": "После включения мотор не вращается",
        "priority": "medium",
        "reporter": "Тестовый сотрудник",
        "opened_at": "2026-11-02T10:00:00+00:00",
    }
    result = client.post("/api/tickets", json=payload)
    assert result.status_code == 201, result.text
    ticket_id = result.json()["id"]
    assert result.json()["status"] == "new"
    assert client.get("/api/stats").json()["tickets_total"] == 1
    status = client.patch(f"/api/tickets/{ticket_id}/status", json={"status": "accepted"})
    assert status.status_code == 200
    assert status.json()["status"] == "accepted"
