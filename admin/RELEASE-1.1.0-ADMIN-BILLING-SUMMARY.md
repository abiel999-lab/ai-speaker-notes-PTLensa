# NotePreso Admin 1.1.0 — Billing Visibility

## Purpose

This release adds read-only Free/Pro and billing-period visibility to the existing NotePreso administration dashboard. The user application database remains the source of truth; the admin application does not create or own a second subscription state.

## User Management

The directory now displays:

- Effective access plan (`FREE` or `PRO`).
- Billing state (active, expiring, expired, pending, past due, or free).
- Payment provider when present (Xendit, Stripe, Paddle, manual, or future provider values).
- Paid access validity date.
- Existing identity status, file count, and last login.

The user detail panel additionally shows the billing provider, validity timestamp, and whether the current provider record represents auto-renewal.

## Overview

A new Billing & Access section reports:

- Active Pro users.
- Free users, including users whose Pro access expired.
- Pro access ending within seven days or already marked to stop renewing.
- Expired Pro subscription records.

## Entitlement Semantics

The admin mirrors the user application's effective-plan behavior:

- Raw plan must be `pro`.
- Status must remain access-bearing (`active`, `trialing`, or `past_due`).
- `current_period_end`, when present, must still be in the future.
- Otherwise effective access is shown as Free.

This means an expired paid record remains visible for auditing while the user is correctly shown as Free.

## Compatibility and Safety

- No database migration is required by the admin release.
- No subscription writes are performed by the admin UI.
- Keycloak is not used as a billing source.
- Databases without the `subscriptions` table remain compatible and all users are shown as Free.
- Existing Keycloak reconciliation, user CRUD, presentation activity, chat privacy controls, and 30-second directory/overview synchronization are preserved.
