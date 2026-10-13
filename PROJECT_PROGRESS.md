# Patientshell Project Progress

## Phase 1 — Project definition (complete)

- Established the Patientshell project overview and initial development direction.
- Selected the canonical repository: mahendradalavai/patientshell.
- Selected Supabase project reference: djwuoubtiagupjenlwml.
- Phase 1 documentation was reviewed and merged by the repository owner.

## Phase 2 — Fresh project foundation (complete)

- Added a Vite + React + TypeScript frontend under `frontend/`.
- Configured Tailwind CSS v4 using the official Vite plugin.
- Added a FastAPI application under `backend/` with `GET /api/health`.
- Added backend dependencies and frontend/backend `.env.example` templates.
- Added root `.gitignore` rules for local secrets, dependencies, and build output.
- The Phase 2 foundation was reviewed and merged into `main`.

## Phase 3 — Database schema, migrations, and Auth (scaffolded)

- Added `supabase/migrations/00001_initial_schema.sql` with identity, patient/doctor profiles, visits, documents, extracted data, labs, medications, review packages, explicit doctor grants, temporary token hashes, questions, reviews/resolutions, and audit events.
- Added `supabase/migrations/00002_rls_policies.sql` with row-level security, explicit grants, patient ownership policies, package-scoped doctor access, and an explicit block for anonymous Auth sessions.
- Added composite foreign keys where patient/package/document relationships need to stay within the same patient's records.
- Added Supabase Python client integration and server-side bearer-token verification in `backend/app/core/auth.py`.
- Added protected `GET /api/me`, returning the authenticated user's database profile and role.
- Kept temporary access token hashes and audit-event writes restricted to trusted server-side workflows.
- Added the Supabase Python dependency to `backend/requirements.txt`.

## Current status and required verification

Phase 3 files are committed to a review branch. The SQL migrations have **not** been applied to the live Supabase project, and the API has not been tested against live credentials or a migrated database.

Before production use:
1. Review and run migrations in a non-production Supabase environment.
2. Add pgTAP tests for owner, non-owner, granted doctor, revoked/expired doctor, and anonymous-session cases.
3. Provision user profiles and doctor verification through a trusted server-side workflow; users must not self-assign doctor/admin roles.
4. Configure environment variables locally without committing real secrets.
5. Run backend tests and verify `GET /api/health` and authenticated `GET /api/me`.
