from app.core.config import Settings
from app.services.support_mail import SupportRequest, build_mailto, clean_text, valid_email


def test_support_smtp_requires_password():
    settings = Settings(smtp_password=None)
    assert settings.support_smtp_configured is False


def test_support_smtp_configured_with_password():
    settings = Settings(smtp_password="example-app-password")
    assert settings.support_smtp_configured is True


def test_support_mailto_contains_prefilled_request():
    payload = SupportRequest(
        request_type="refund",
        name="Ada User",
        email="ada@example.com",
        transaction_id="INV-123",
        message="Please review this refund request.",
        reference="SUP-ABC123",
    )
    link = build_mailto("billing@notepreso.com", payload)
    assert link.startswith("mailto:billing@notepreso.com?")
    assert "Refund%20request" in link
    assert "SUP-ABC123" in link
    assert "INV-123" in link


def test_support_input_helpers():
    assert clean_text("  Ada   User  ", max_length=120) == "Ada User"
    assert valid_email("ada@example.com") is True
    assert valid_email("not-an-email") is False
