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

## Phase 6 — Doctor portal, review packages, and clinical comparison (complete; merged in PR #6)
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


## Phase 7 — Dr. Anya AI Companion (implementation on review branch)
- Created `phase-7/dr-anya-ai` from the updated `main` after the project owner merged PR #6.
- Added `backend/app/services/ai_companion.py`: provider adapter for OpenAI, Anthropic, and OpenAI-compatible local endpoints; credentials are read only from server-side `AI_PROVIDER_API_KEY`, with `AI_MODEL_NAME`, `AI_PROVIDER`, and optional `AI_BASE_URL` configuration. Keys are never accepted from request payloads or returned to clients.
- Missing key/model configuration returns `configured: false` and the exact truthful support/configuration message. It does not simulate or fabricate an AI medical answer.
- Added `POST /api/patient/ai/explain`. It uses the existing Supabase-verified patient JWT and database-backed patient role, checks the document against both document ID and `auth.uid()`-derived profile ID, then retrieves extracted rows constrained by the same patient and document IDs. Foreign document IDs return a generic 404.
- Prompt template treats document text and user questions as untrusted data; grounds patient-specific statements only in extracted facts; separates source facts from lay explanations; asks for accessible English and Telugu; expresses uncertainty; prohibits diagnosis, drug dosing, and medication changes.
- The response contains extracted facts, source/page/quote references, bilingual explanation fields, uncertainty, suggested questions for the doctor, and English/Telugu professional-care disclaimers. Provider or output failures return no generated medical explanation.
- Added `frontend/src/components/DrAnyaChat.tsx`: floating companion drawer, English/Telugu toggle, extracted-facts card, explanation card, source references, unconfigured banner, and professional-care disclaimer. The portal layout exposes the companion across patient dashboard, timeline, and documents; document-specific launch controls pass the selected document ID.
- This is a patient-education feature, not a clinical decision-support or diagnostic system. Provider credentials, network access, production AI usage, and live environment variables are not configured or validated by this code change.

## Phase 7 configuration and verification notes
- Backend environment: `AI_PROVIDER_API_KEY` and `AI_MODEL_NAME` required; `AI_PROVIDER=openai|anthropic|local` optional (defaults to `openai`); `AI_BASE_URL` required for a local OpenAI-compatible endpoint.
- Local provider must expose an OpenAI-compatible `/chat/completions` endpoint. Use a server-only secret store; never set AI keys in `VITE_*` variables.
- API route: `POST /api/patient/ai/explain` with `document_id`, optional `question`, and `language: en|te`. Patient role and ownership are enforced server-side.
- Prompt output is expected to be JSON with `explanation_en`, `explanation_te`, `uncertainty`, and `ask_doctor_questions`; malformed provider output fails closed with no explanation.
- No automated tests, TypeScript build, live provider request, or live Supabase check has been run in this environment. Validate provider-specific JSON response formats, patient ownership/RLS, unconfigured behavior, Telugu rendering, prompt-injection attempts in OCR text, and failure/time-out handling in CI/staging before production.
