# Patientshell Project Progress

## Phase 1 — Project definition (complete)

- Established the Patientshell project overview and initial development direction.
- Selected the canonical repository: mahendradalavai/patientshell.
- Selected Supabase project reference: djwuoubtiagupjenlwml.
- Phase 1 documentation was reviewed and merged by the repository owner.

## Phase 2 — Fresh project foundation (complete)

- Added a Vite + React + TypeScript frontend under \`frontend/\`.
- Configured Tailwind CSS v4 using the official Vite plugin.
- Added a FastAPI application under \`backend/\` with \`GET /api/health\`.
- Added backend dependencies and frontend/backend \`.env.example\` templates.
- Added root \`.gitignore\` rules for local secrets, dependencies, and build output.
- The Phase 2 foundation was reviewed and merged into \`main\`.

## Phase 3 — Database schema, migrations, and Auth (complete; merged)

- PR #3 was reviewed and merged into \`main\`.
- Added \`supabase/migrations/00001_initial_schema.sql\` for identity, patient/doctor profiles, visits, documents, extracted data, labs, medications, review packages, explicit doctor grants, temporary token hashes, questions, reviews/resolutions, and audit events.
- Added \`supabase/migrations/00002_rls_policies.sql\` with row-level security, patient ownership, package-scoped doctor access, and anonymous-session restrictions.
- Added \`backend/app/core/auth.py\` and protected \`GET /api/me\`.
- Migrations have not been confirmed as applied to the live Supabase project; apply and validate them in a development environment before production use.

## Phase 4 — Patient portal and branch reconciliation (implementation in review)

- Confirmed PR #3 is merged; created \`phase-4/patient-portal\` from the latest \`main\`, so Phase 3 changes are included without rebasing the old branch.
- Added the frontend Supabase client with persisted browser sessions, sign-up/sign-in, and auth state context.
- Added patient-only route guards based on the verified database profile role.
- Added patient dashboard, demographic profile view/update, chronological visit/document timeline, review package summary, and patient question submission/status/resolution views.
- Added protected backend endpoints: \`GET /api/patient/profile\`, \`PATCH /api/patient/profile\`, \`GET /api/patient/timeline\`, \`GET /api/patient/questions\`, and \`POST /api/patient/questions\`.
- Patient endpoints use a verified bearer JWT, require the database role \`patient\`, scope queries to the authenticated user, and continue to rely on RLS.
- Added \`supabase/migrations/00003_auth_profile_provisioning.sql\` to create a patient-role application profile on Auth signup; the role is set server-side and is never taken from user metadata.

## Verification and remaining work

- Phase 4 code is committed to its review branch. It has not been merged.
- No live Supabase schema changes were applied as part of Phase 4.
- Configure \`frontend/.env.local\` with the Supabase project URL and publishable key, and configure the backend environment from \`backend/.env.example\`.
- Run \`npm install\` and \`npm run build\` in \`frontend/\`; install backend requirements and test all protected endpoints against a development Supabase project.
- Add automated tests for signup/profile provisioning, patient ownership, non-patient role denial, question submission, and RLS behavior before production deployment.
