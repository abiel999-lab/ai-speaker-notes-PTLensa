"""Offline tests; make NO calls to OpenAI."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
from fastapi.testclient import TestClient
import support_api

KEY = "local_test_only_" + "z" * 40


class FakeResponses:
    def create(self, **kwargs):
        assert kwargs["store"] is False
        assert kwargs["model"] == "gpt-6-luna"
        assert kwargs["text"]["format"]["strict"] is True
        return SimpleNamespace(
            status="completed",
            output_text=json.dumps({"action": "escalate", "reply": "Hubungi billing@actiacarbon.com"}),
            usage=SimpleNamespace(input_tokens=110, output_tokens=13),
        )


class FakeClient:
    def __init__(self, **kwargs):
        self.responses = FakeResponses()


class SupportTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        base = Path(self.dir.name)
        docs = base / "docs"
        state = base / "state"
        docs.mkdir()
        state.mkdir()
        (docs / "knowledge-base-v1.md").write_text("Support email: billing@actiacarbon.com\n")
        (docs / "bot-policy-v1.md").write_text("No refunds without human verification\n")
        env = {
            "SUPPORT_AI_SHARED_KEY": KEY,
            "SUPPORT_AI_ROOT": str(docs),
            "SUPPORT_AI_STATE_DB": str(state / "quota.sqlite3"),
            "SUPPORT_AI_PER_MINUTE_MAX": "2",
            "SUPPORT_AI_DAILY_MAX": "3",
            "SUPPORT_AI_MODEL": "gpt-6-luna",
            "OPENAI_API_KEY": "mock_api_key_never_sent",
        }
        self.env = patch.dict(os.environ, env)
        self.mock = patch.object(support_api, "_new_client", lambda api_key: FakeClient())
        self.env.start()
        self.mock.start()
        self.client = TestClient(support_api.app)

    def tearDown(self):
        self.client.close()
        self.mock.stop()
        self.env.stop()
        self.dir.cleanup()

    def test_auth_required(self):
        r = self.client.post("/v1/support/reply", json={"message": "Help me"})
        self.assertEqual(r.status_code, 401)

    def test_valid_structured_reply(self):
        r = self.client.post("/v1/support/reply", headers={"X-Support-Key": KEY}, json={"message": "I need a refund"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["action"], "escalate")
        self.assertEqual(r.json()["handoff"], True)

    def test_rate_limit_persists(self):
        for i in range(3):
            r = self.client.post("/v1/support/reply", headers={"X-Support-Key": KEY}, json={"message": "Need help"})
            self.assertEqual(r.status_code, 200 if i < 2 else 429)

    def test_health(self):
        self.assertEqual(self.client.get("/healthz").status_code, 200)

    def test_input_limit(self):
        r = self.client.post("/v1/support/reply", headers={"X-Support-Key": KEY}, json={"message": "a" * 2000})
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main(verbosity=2)
