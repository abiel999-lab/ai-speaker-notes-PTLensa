from fastapi.testclient import TestClient

from app.main import app


class _FakeMailer:
    configured = True

    def __init__(self):
        self.calls = []

    def send_request(self, **kwargs):
        self.calls.append(kwargs)
        return "SUP-TEST123"


def test_support_page_exposes_contact_and_refund_workflows():
    with TestClient(app) as client:
        response = client.get("/support")
        assert response.status_code == 200
        body = response.text
        assert "Pusat bantuan NotePreso" in body
        assert "billing@notepreso.com" in body
        assert "Support teknis" in body
        assert "Billing & akun" in body
        assert "Pengajuan refund" in body
        assert "bukti pembayaran" in body.lower()
        assert "Xendit" in body
        assert "Paddle" in body


def test_old_refund_policy_url_redirects_to_support():
    with TestClient(app) as client:
        response = client.get("/refund-policy", follow_redirects=False)
        assert response.status_code == 302
        assert response.headers["location"] == "/support#refund"


def test_support_form_sends_general_request():
    with TestClient(app) as client:
        fake = _FakeMailer()
        client.app.state.support_mailer = fake
        response = client.post(
            "/support/request",
            data={
                "request_type": "technical",
                "name": "Abiel",
                "account_email": "user@example.com",
                "subject": "PPT error",
                "message": "PPT saya berhenti diproses pada tahap akhir.",
            },
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert "sent=1" in response.headers["location"]
        assert len(fake.calls) == 1
        assert fake.calls[0]["request_type"] == "technical"


def test_refund_requires_payment_proof():
    with TestClient(app) as client:
        fake = _FakeMailer()
        client.app.state.support_mailer = fake
        response = client.post(
            "/support/request",
            data={
                "request_type": "refund",
                "name": "Abiel",
                "account_email": "user@example.com",
                "subject": "Pengajuan refund NotePreso",
                "message": "Saya mengajukan refund karena pembayaran terduplikasi.",
                "provider": "xendit",
                "transaction_id": "INV-001",
            },
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert "error=proof" in response.headers["location"]
        assert fake.calls == []


def test_refund_with_payment_proof_is_sent():
    with TestClient(app) as client:
        fake = _FakeMailer()
        client.app.state.support_mailer = fake
        response = client.post(
            "/support/request",
            data={
                "request_type": "refund",
                "name": "Abiel",
                "account_email": "user@example.com",
                "subject": "Pengajuan refund NotePreso",
                "message": "Saya mengajukan refund karena pembayaran terduplikasi.",
                "provider": "paddle",
                "transaction_id": "txn_001",
                "amount": "USD 9.99",
            },
            files={"attachment": ("receipt.pdf", b"%PDF-test", "application/pdf")},
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert "sent=1" in response.headers["location"]
        assert len(fake.calls) == 1
        assert fake.calls[0]["provider"] == "paddle"
        assert fake.calls[0]["attachment"].filename == "receipt.pdf"


def test_legal_page_links_support_refund_section():
    with TestClient(app) as client:
        response = client.get("/legal")
        assert response.status_code == 200
        assert "/support#refund" in response.text
