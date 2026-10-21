# VPS Source Import — 2026-10-21

This directory contains source snapshots collected from
ACTIA production infrastructure.

## Contents

- presentation/: release 9f.1 source and selected 9h runtime assets
- admin/: Phase 9H staging source and active application files
- notepreso/: September release source and active application files

## Important limitations

These snapshots are not yet verified as complete buildable
copies of every currently deployed application.

The active Presentation application is 9h, whereas the
available source release is 9f.1.

Runtime application code may differ from historical releases.

Three unverified files were excluded from this Git import:

- presentation/source-release-9f1/tests/workspace.test.ts
- admin/source-phase9h/tests/test_v100_production.py
- notepreso/source-release-20260915/deploy/postgres/01-init.sh

The original VPS source and private staging snapshots
were not modified by these exclusions.

Database contents, user data, credentials, and production
secrets are intentionally excluded.

Do not deploy directly from this import without validating
source completeness, configuration, and build reproducibility.
