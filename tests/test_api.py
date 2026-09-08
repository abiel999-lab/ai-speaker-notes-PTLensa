from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_home_health_and_docs_headers():
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["x-request-id"]

        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"
        assert health.json()["version"]

        live = client.get("/api/v1/health/live")
        assert live.status_code == 200
        assert live.json()["status"] == "ok"

        ready = client.get("/health/ready")
        assert ready.status_code == 200
        assert ready.json()["checks"]["storage"] == "ok"

        docs = client.get("/docs")
        assert docs.status_code == 200
        assert "cdn.jsdelivr.net" in docs.headers["content-security-policy"]
        assert "swagger-ui" in docs.text.lower()


def test_job_route_rejects_non_pptx():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/jobs",
            files={"file": ("bad.txt", b"not a deck", "text/plain")},
            data={"language": "Bahasa Indonesia", "audience": "Umum", "depth": "Standar"},
        )
        assert response.status_code == 415


def test_job_route_rejects_cross_site_browser_upload(sample_pptx: Path):
    with TestClient(app) as client, sample_pptx.open("rb") as fh:
        response = client.post(
            "/api/v1/jobs",
            headers={"Origin": "https://example.invalid", "Sec-Fetch-Site": "cross-site"},
            files={
                "file": (
                    "sample.pptx",
                    fh,
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                )
            },
        )
        assert response.status_code == 403


def test_job_route_processes_valid_pptx(sample_pptx: Path):
    with TestClient(app) as client:
        with sample_pptx.open("rb") as fh:
            response = client.post(
                "/api/v1/jobs",
                files={
                    "file": (
                        "sample.pptx",
                        fh,
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    )
                },
                data={
                    "language": "Bahasa Indonesia",
                    "audience": "Teknis",
                    "depth": "Standar",
                    "notes_mode": "missing_only",
                },
            )
        assert response.status_code == 202
        job = response.json()
        status = client.get(f"/api/v1/jobs/{job['id']}").json()
        assert status["status"] == "completed"
        assert status["generated_notes_count"] == 2
        assert status["existing_notes_count"] == 0
        download = client.get(status["download_url"])
        assert download.status_code == 200
        assert download.content[:2] == b"PK"


def test_openai_job_is_rejected_when_not_configured(sample_pptx: Path):
    # Isolate this test from the developer's real .env. A configured local API key
    # must never change the expected behavior of a unit test.
    with TestClient(app) as client:
        settings = client.app.state.settings
        original_key = settings.openai_api_key
        settings.openai_api_key = None
        try:
            with sample_pptx.open("rb") as fh:
                response = client.post(
                    "/api/v1/jobs",
                    files={
                        "file": (
                            "sample.pptx",
                            fh,
                            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        )
                    },
                    data={"engine": "openai", "use_vision": "false"},
                )
            assert response.status_code == 503
            assert "OPENAI_API_KEY" in response.json()["detail"]
        finally:
            settings.openai_api_key = original_key


def test_failed_job_can_be_retried_and_attempt_count_increments(sample_pptx: Path):
    from app.domain.models import JobStatus

    with TestClient(app) as client:
        with sample_pptx.open("rb") as fh:
            created = client.post(
                "/api/v1/jobs",
                files={
                    "file": (
                        "sample.pptx",
                        fh,
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    )
                },
            )
        assert created.status_code == 202
        job_id = created.json()["id"]
        record = client.app.state.store.get(job_id)
        assert record.status == JobStatus.completed
        assert record.attempt_count == 1

        record.status = JobStatus.failed
        record.error = "simulated failure after a previous attempt"
        record.output_path = None
        client.app.state.store.save(record)

        retried = client.post(f"/api/v1/jobs/{job_id}/retry")
        assert retried.status_code == 202
        final = client.get(f"/api/v1/jobs/{job_id}").json()
        assert final["status"] == "completed"
        assert final["attempt_count"] == 2
