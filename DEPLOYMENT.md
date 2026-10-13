# Production deployment runbook

Patientshell can run as one container: FastAPI serves API routes and, when frontend/dist exists, the React SPA and /assets from the same origin.

**Production safety:** this application handles sensitive medical records. Use HTTPS, private Storage, reviewed RLS, least-privilege credentials, backups and staging validation. Do not use real patient data in development. This repository does not claim regulatory compliance.

## 1. Supabase setup

1. Create/select the intended Supabase project and record its URL and anon/publishable key.
2. Configure Auth site URL and redirect URLs for the deployed HTTPS origin and local development.
3. Install the Supabase CLI, authenticate and link the project:
   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase migration list
   ```
4. Review and apply migrations in this exact order:
   1. supabase/migrations/00001_initial_schema.sql — core schema.
   2. supabase/migrations/00002_rls_policies.sql — row-level security.
   3. supabase/migrations/00003_auth_profile_provisioning.sql — auth/profile provisioning.
   4. supabase/migrations/00004_document_storage_policies.sql — private medical-records bucket and policies.
   5. supabase/migrations/00005_doctor_review_access.sql — doctor review grants, temporary-token validation and audit support.
5. Review supabase/VERIFICATION.md, compare local and remote history, and inspect supabase db push --dry-run where supported. Apply only after a human reviews the plan. Never run migrations automatically at container startup or reset a production database.
6. Validate RLS and Storage with separate synthetic patient and verified-doctor accounts. Confirm unrelated patients cannot access each other's records, and unverified doctors or expired/revoked grants are rejected.

## 2. Environment variables

Copy .env.production.example to .env for local Docker testing, or configure values in the hosting platform's secret manager. Never commit a populated env file.

Backend runtime:
- SUPABASE_URL — project URL.
- SUPABASE_ANON_KEY — anon/publishable key. Do not use a service-role key to bypass RLS.
- AI_PROVIDER_API_KEY and AI_MODEL_NAME — required only to enable the Dr. Anya provider.
- AI_PROVIDER — openai, anthropic, or local; defaults to openai.
- AI_BASE_URL — custom provider-compatible endpoint; required for a local OpenAI-compatible endpoint.
- CORS_ORIGINS — comma-separated browser origins; same-origin production normally does not need additional CORS origins.

Frontend build-time public values:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY
- VITE_API_BASE_URL — leave blank for same-origin; set an HTTPS API base only if frontend and backend are hosted separately.

Never place AI keys, database passwords, or Supabase service-role keys in VITE_* variables. Frontend values are compiled into public static assets, so rebuild after changing them.

## 3. Build and run with Docker

Requirements: Docker Engine and Compose plugin.

```sh
cp .env.production.example .env
# Edit .env with actual values before starting.
docker compose build --no-cache
docker compose up -d
docker compose ps
docker compose logs -f patientshell
curl -fsS http://localhost:8000/health
curl -fsS http://localhost:8000/api/health
```

Open http://localhost:8000. Expected health JSON is {"status":"ok","service":"patientshell-api"}. This is a liveness check only; it does not prove Supabase, RLS, OCR or AI readiness. Change HOST_PORT in .env to expose a different host port.

The multi-stage image uses Node 20 to build the frontend and Python 3.11 slim to run FastAPI. It installs Tesseract, Poppler and OpenCV system libraries, copies frontend/dist into the runtime image and runs as an unprivileged user. Database migrations are never run by the image.

## 4. Render, Railway, Fly.io or cloud container runtimes

1. Create a web/container service from this repository using the root Dockerfile and repository root as build context.
2. Pass VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and blank VITE_API_BASE_URL as Docker build arguments. These are public frontend settings baked in at build time.
3. Configure SUPABASE_URL, SUPABASE_ANON_KEY, CORS_ORIGINS and optional AI provider values in runtime environment/secret settings.
4. Route to the platform-provided PORT (defaults to 8000) and configure /health as the HTTP health check. Terminate TLS at the platform edge.
5. Deploy to staging first. Test sign-in, document upload/private Storage, doctor grants, signed source previews, OCR, and Dr. Anya's configured/unconfigured behavior before production promotion.

The service is stateless; medical records live in Supabase Storage, not the container filesystem. The review-token limiter is in-memory and per process. Use a shared limiter before multi-worker or multi-replica scaling.

## 5. Local development

Backend:
```sh
cd backend
python -m venv .venv
# Activate the environment, then:
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest
```

Frontend in a second terminal:
```sh
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Without frontend/dist, FastAPI stays API-only and gives a clear 404 for browser routes. Run Vite separately for frontend development. After npm run build, FastAPI can serve the SPA.

## 6. Troubleshooting

- Sign-in/API failure: verify Supabase URL/key, frontend build-time values, Auth redirect URLs and browser network errors. Rebuild after changing VITE_* values.
- RLS/403/404: do not disable RLS. Confirm migrations 00001–00005, profile provisioning, ownership checks, doctor verification and active package grants.
- OCR failure: verify tesseract-ocr, poppler-utils, libgl1 and libglib2.0-0 exist in the runtime. Digital PDFs may extract text directly; scanned PDFs require Poppler/Tesseract. Avoid logging medical document contents.
- Source preview unavailable: verify package grant, authorized document path, private bucket, and that the short-lived signed URL has not expired.
- Dr. Anya unconfigured: set AI_PROVIDER_API_KEY and AI_MODEL_NAME as runtime secrets. For local provider, set AI_BASE_URL and verify network access.
- Container exits: inspect docker compose logs patientshell, verify .env exists, and ensure the host port is free.
- SPA route 404: verify frontend/dist/index.html exists in the image and the Vite build succeeded.
- Migration mismatch: stop and reconcile supabase migration list with supabase/VERIFICATION.md. Never blindly replay SQL against production.

## 7. Release checklist

- [ ] PR reviewed and merged by repository owner.
- [ ] Backend tests, TypeScript check and Vite build pass in CI.
- [ ] Migrations reconciled and applied with explicit approval.
- [ ] RLS, private Storage, doctor grants, token expiry/revocation and audit behavior tested with synthetic accounts.
- [ ] Runtime secrets configured in the platform secret manager.
- [ ] HTTPS, health checks, backups, access-controlled logs and monitoring configured.
- [ ] Staging walkthrough passed for patient, doctor, OCR and AI flows.
- [ ] Privacy/security and applicable healthcare obligations reviewed by qualified personnel.
