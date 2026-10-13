# Patientshell Project Progress

## Phase 1 — Project definition (complete)
- Selected canonical repository: \`mahendradalavai/patientshell\`.
- Selected Supabase project reference: \`djwuoubtiagupjenlwml\`.

## Phase 2 — Foundation (complete; merged)
- React, TypeScript, Tailwind frontend and FastAPI backend foundation.

## Phase 3 — Database schema and authentication (complete; merged)
- Core patient/doctor profiles, visits, documents, extracted data, labs, medications, review packages, grants, questions, reviews/resolutions, and audit events.
- Supabase Auth bearer-token verification and patient ownership/RLS policies.

## Phase 4 — Patient portal (complete; merged in PR #4)
- Supabase session context, patient route guard, dashboard, profile, timeline, questions, and protected patient APIs.

## Phase 5 — Document processing and OCR (complete; merged in PR #5)
- PDF/JPG/PNG validation, 15 MiB limit, digital PDF extraction, OpenCV preprocessing, Tesseract OCR interface, and scanned-PDF fallback.
- Conservative rules for report dates, selected lab tests, and medication name/dose patterns; uncertain values flagged for human review with source page/quote/coordinates when available.
- Patient document upload/list/review endpoints, private Storage bucket policies, document management UI, and audit-trigger support.
- Migration \`00004_document_storage_policies.sql\` must be applied and validated separately in the intended Supabase environment.

## Phase 6 — Doctor portal, review packages, and clinical comparison (implementation on review branch)
- Created \`phase-6/doctor-portal\` from the latest \`main\` after PR #5 was merged by the project owner.
- Added \`backend/app/api/routes/doctor.py\` and registered the doctor router in \`backend/app/main.py\`.
- Added \`GET /api/doctor/queue\`, \`GET /api/doctor/reviews/{package_id}\`, \`POST /api/doctor/reviews/{package_id}/notes\`, \`POST /api/doctor/reviews/{package_id}/resolve\`, and \`POST /api/doctor/questions/{question_id}/respond\`.
- Doctor API checks the database-backed \`user_profiles.role = 'doctor'\` and requires a \`doctor_profiles\` row with \`verification_status = 'verified'\`. Each package endpoint additionally checks a non-revoked grant for that doctor and rejects expired grants; package-linked queries are constrained to the grant's patient and package membership.
- Optional temporary review tokens are SHA-256 hashed before validation. Migration \`00005_doctor_review_access.sql\` adds a restricted database validator that checks token expiry, revocation, the doctor's verified role, and a current package grant. Token attempts are rate-limited in the API process; production deployments with multiple workers should replace this with a shared rate limiter.
- Added database audit triggers for doctor review changes and patient question responses. The migration must be applied before the temporary token RPC is available.
- Added doctor-only frontend route guard and routes \`/doctor\`, \`/doctor/reviews/:packageId\`, assigned review queue, urgency/grant display, document/extracted-entity workspace, longitudinal lab comparison, clinical notes/recommendations, question responses, and resolution controls.
- Comparison groups by exact test label and only treats values as directly comparable when units are present and match and reference-range context is consistent. No unit conversion or automated diagnosis is performed; mismatched/missing units and context are flagged for clinician review.

## Verification and deployment notes
- Phase 6 code is on \`phase-6/doctor-portal\`; do not merge until the project owner approves the pull request.
- No Supabase migration has been applied to the live project from this implementation.
- Automated backend tests and frontend build have not been run in this environment. Validate with CI before production use.
- Test non-doctor denial, unverified doctor denial, revoked/expired grants, invalid/expired/revoked temporary tokens, rate limiting, package membership boundaries, audit triggers, question response access, and comparison handling for missing/different units.
- Configure backend \`SUPABASE_URL\` and \`SUPABASE_ANON_KEY\`, frontend \`VITE_API_BASE_URL\`, and install/verify OCR system dependencies as documented in Phase 5.
