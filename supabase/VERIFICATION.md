# Supabase migration verification

Apply migrations in ascending filename order against the intended local or staging project.

1. `00001_initial_schema.sql` — core tables, constraints, indexes.
2. `00002_rls_policies.sql` — authentication helpers and row-level security policies.
3. `00003_auth_profile_provisioning.sql` — patient portal schema/policies (if present in the repository migration history).
4. `00004_document_storage_policies.sql` — private `medical-records` bucket, owner policies, document/extraction audit triggers.
5. `00005_doctor_review_access.sql` — temporary review-token validator and review audit triggers.

The current repository contains these exact filenames in order. Confirm the local and remote migration history still matches before applying. Use `supabase migration list` to compare local and remote history, then `supabase db push --dry-run` where supported, and only apply after a human reviews the plan. Never reset or push migrations to production as an automated test.

Seed policy: `supabase/seed.sql` is intentionally empty except for instructions. Test fixtures belong in isolated test databases and must use synthetic data only.
