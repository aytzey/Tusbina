from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_courses_contract() -> None:
    response = client.get("/api/v1/courses")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload

    course = payload[0]
    part = course["parts"][0]

    update_response = client.put(
        f"/api/v1/courses/{course['id']}/parts/{part['id']}/position",
        json={"last_position_sec": 120},
    )
    assert update_response.status_code == 200
    updated_course = update_response.json()
    assert updated_course["id"] == course["id"]


def test_usage_contract() -> None:
    response = client.get("/api/v1/usage")
    assert response.status_code == 200
    payload = response.json()
    assert "remaining_sec" in payload
