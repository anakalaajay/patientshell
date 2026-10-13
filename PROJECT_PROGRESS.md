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
- Added migrations for identity, patient/doctor profiles, visits, documents, extracted data, labs, medications, review packages, explicit doctor grants, questions, reviews/resolutions, and audit events.
- Added row-level security, patient ownership, package-scoped doctor access, and anonymous-session restrictions.
- Added verified Supabase bearer-token authentication and protected \`GET /api/me\`.
- Live migration application must be confirmed separately.

## Phase 4 — Patient portal (complete; merged)

- PR #4 was reviewed and merged by the project owner into \`main\`.
- Added persisted Supabase Auth sessions, sign-up/sign-in, and patient-only route guards.
- Added dashboard, demographic profile view/update, chronological medical timeline, review package summary, and patient question submission/status/resolution views.
- Added protected profile, timeline, and question endpoints.
- Added \`00003_auth_profile_provisioning.sql\` to provision a patient-role application profile on Auth signup. Role assignment is server-side and not taken from user metadata.

## Phase 5 — Medical document processing and OCR intelligence (implementation on review branch)

- Created \`phase-5/document-intelligence\` from the latest \`main\`.
- Added PDF/JPG/PNG validation and a 15 MiB size limit.
- Added digital PDF extraction with pdfplumber, OpenCV image enhancement, Tesseract OCR fallback, and scanned-PDF rendering through pdf2image when available.
- Added conservative rule-based extraction for dates, selected common lab test results, and medication name/dose patterns. Ambiguous dates, missing units, OCR issues, and medication matches are flagged for human review rather than silently guessed.
- Extracted items retain page number, source quote, extraction method, and available word-coordinate bounding boxes.
- Added patient-only document upload/list/extracted-data/review endpoints; storage uses a private \`medical-records\` bucket and JWT-scoped Supabase clients.
- Added human confirm/reject/correct workflow and audit event metadata.
- Added patient document uploader, upload progress, status badges, extracted item review, and timeline navigation.

## Verification and deployment notes

- Phase 5 changes are on \`phase-5/document-intelligence\`; do not merge into \`main\` until reviewed and approved.
- \`supabase/migrations/00004_document_storage_policies.sql\` is committed as a migration file only; it has not been applied to the live Supabase project.
- The OCR engine requires the Tesseract system binary. Scanned PDF OCR also requires Poppler for pdf2image; if these are missing, extraction errors are surfaced and the document is marked failed rather than fabricating results.
- Configure \`SUPABASE_URL\` and \`SUPABASE_ANON_KEY\` for the backend and \`VITE_API_BASE_URL\` if the API is hosted separately from the frontend.
- Install backend requirements and run tests, then run \`npm install\` and \`npm run build\` in \`frontend/\`. Network access previously failed in the execution environment, so build/test results must be verified in CI or a connected development environment.
- Before production, test patient ownership, Storage RLS, upload size/type rejection, extraction traceability, low-confidence review flags, and audit logs with separate patient accounts.
