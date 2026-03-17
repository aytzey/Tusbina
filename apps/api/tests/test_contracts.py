import math

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


def test_course_completion_threshold_is_95_percent() -> None:
    response = client.get("/api/v1/courses")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload

    course = payload[0]
    part = course["parts"][0]
    duration_sec = max(part["duration_sec"], 20)
    in_progress_position = max(1, math.floor(duration_sec * 0.94))
    completed_position = max(1, math.ceil(duration_sec * 0.95))

    almost_done_response = client.put(
        f"/api/v1/courses/{course['id']}/parts/{part['id']}/position",
        json={"last_position_sec": in_progress_position},
    )
    assert almost_done_response.status_code == 200
    almost_done_part = next(
        item for item in almost_done_response.json()["parts"] if item["id"] == part["id"]
    )
    assert almost_done_part["status"] == "inProgress"

    completed_response = client.put(
        f"/api/v1/courses/{course['id']}/parts/{part['id']}/position",
        json={"last_position_sec": completed_position},
    )
    assert completed_response.status_code == 200
    completed_part = next(item for item in completed_response.json()["parts"] if item["id"] == part["id"])
    assert completed_part["status"] == "completed"


def test_usage_contract() -> None:
    response = client.get("/api/v1/usage")
    assert response.status_code == 200
    payload = response.json()
    assert "remaining_sec" in payload
