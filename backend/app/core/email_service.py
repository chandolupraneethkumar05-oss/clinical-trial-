"""
ProtocolShield Transactional Email Delivery Service
Supports Resend, SendGrid, Mailgun, and SMTP for password reset delivery.
Never logs raw reset tokens, API keys, or SMTP passwords.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import quote

import httpx
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """Raised when password-reset email delivery is unconfigured or fails."""


def is_email_configured() -> bool:
    """Returns True only when the configured EMAIL_PROVIDER has required credentials."""
    provider = (settings.EMAIL_PROVIDER or "").strip().lower()
    sender = (settings.EMAIL_FROM or "").strip()
    if not provider or not sender:
        return False

    if provider in {"resend", "sendgrid"}:
        return bool((settings.EMAIL_API_KEY or "").strip())
    if provider == "mailgun":
        return bool((settings.EMAIL_API_KEY or "").strip() and (settings.EMAIL_MAILGUN_DOMAIN or "").strip())
    if provider == "smtp":
        return bool((settings.SMTP_HOST or "").strip())
    return False


def build_password_reset_url(reset_token: str) -> str:
    base = (settings.FRONTEND_URL or "http://localhost:5173").strip().rstrip("/")
    return f"{base}/#/reset-password?token={quote(reset_token, safe='')}"


def _build_email_bodies(reset_token: str) -> tuple[str, str, str]:
    reset_url = build_password_reset_url(reset_token)
    ttl = settings.PASSWORD_RESET_EXPIRE_MINUTES
    subject = "ProtocolShield — Password Reset Instructions"
    text_body = (
        "You requested a password reset for your ProtocolShield account.\n\n"
        f"Reset link (expires in {ttl} minutes):\n{reset_url}\n\n"
        f"Or enter this single-use reset token in the recovery form:\n{reset_token}\n\n"
        "If you did not request this reset, you may safely ignore this email."
    )
    html_body = (
        "<p>You requested a password reset for your <strong>ProtocolShield</strong> account.</p>"
        f"<p><a href=\"{reset_url}\">Reset your password</a> (expires in {ttl} minutes).</p>"
        f"<p>Single-use token: <code>{reset_token}</code></p>"
        "<p>If you did not request this reset, you may safely ignore this email.</p>"
    )
    return subject, text_body, html_body


def _send_via_smtp(recipient_email: str, subject: str, text_body: str, html_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM.strip()
    msg["To"] = recipient_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    host = settings.SMTP_HOST.strip()
    port = int(settings.SMTP_PORT)
    user = (settings.SMTP_USER or "").strip()
    password = settings.SMTP_PASSWORD or settings.EMAIL_API_KEY or ""

    if port == 465 and not settings.SMTP_USE_TLS:
        with smtplib.SMTP_SSL(host, port, timeout=10) as server:
            if user:
                server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.ehlo()
            if settings.SMTP_USE_TLS:
                server.starttls()
                server.ehlo()
            if user:
                server.login(user, password)
            server.send_message(msg)


async def send_password_reset_email(recipient_email: str, reset_token: str) -> None:
    """
    Delivers password-reset link/token using the configured email provider.
    Raises EmailDeliveryError on failure without exposing secrets or raw tokens.
    """
    if not is_email_configured():
        raise EmailDeliveryError("Email delivery provider is not configured.")

    provider = settings.EMAIL_PROVIDER.strip().lower()
    sender = settings.EMAIL_FROM.strip()
    api_key = (settings.EMAIL_API_KEY or "").strip()
    subject, text_body, html_body = _build_email_bodies(reset_token)

    try:
        if provider == "resend":
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": sender,
                        "to": [recipient_email],
                        "subject": subject,
                        "text": text_body,
                        "html": html_body,
                    },
                )
                if resp.status_code >= 400:
                    raise EmailDeliveryError(f"Resend API rejected email request with HTTP {resp.status_code}.")

        elif provider == "sendgrid":
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "personalizations": [{"to": [{"email": recipient_email}]}],
                        "from": {"email": sender},
                        "subject": subject,
                        "content": [
                            {"type": "text/plain", "value": text_body},
                            {"type": "text/html", "value": html_body},
                        ],
                    },
                )
                if resp.status_code >= 400:
                    raise EmailDeliveryError(f"SendGrid API rejected email request with HTTP {resp.status_code}.")

        elif provider == "mailgun":
            domain = settings.EMAIL_MAILGUN_DOMAIN.strip()
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"https://api.mailgun.net/v3/{domain}/messages",
                    auth=("api", api_key),
                    data={
                        "from": sender,
                        "to": recipient_email,
                        "subject": subject,
                        "text": text_body,
                        "html": html_body,
                    },
                )
                if resp.status_code >= 400:
                    raise EmailDeliveryError(f"Mailgun API rejected email request with HTTP {resp.status_code}.")

        elif provider == "smtp":
            await run_in_threadpool(_send_via_smtp, recipient_email, subject, text_body, html_body)

        else:
            raise EmailDeliveryError(f"Unsupported EMAIL_PROVIDER '{provider}'.")

    except EmailDeliveryError:
        raise
    except (httpx.RequestError, smtplib.SMTPException, OSError) as exc:
        logger.error("Password reset email delivery failed for provider '%s': %s", provider, type(exc).__name__)
        raise EmailDeliveryError("Email provider is currently unavailable.") from exc
