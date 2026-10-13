# Patientshell

Patientshell is the starting repository for a patient-centered healthcare platform. The goal is to bring patient and care-team workflows into one maintainable application, with a secure backend and a clear path from prototype to production.

> **Phase 1 status:** project foundation and architecture are being established. This README describes the intended direction; it does not claim that the application features below are already implemented.

## Product direction

The platform is intended to support workflows such as:

- **Patients:** secure sign-in and access to their own health-related information.
- **Doctors and care teams:** role-appropriate views for reviewing patient information and coordinating care.
- **Platform administrators:** controlled management of users, roles, and operational configuration.
- **AI-assisted features:** future assistance for organizing or explaining information, with appropriate safeguards and clinical oversight.

These are product goals, not a statement that these features are currently available.

## Planned technical foundation

- **Frontend:** React-based web application (implementation to be confirmed from the codebase as it is added).
- **Backend and data:** Supabase, using PostgreSQL and Supabase Auth where appropriate.
- **Authorization:** role-based access and PostgreSQL Row Level Security (RLS) policies designed around least privilege.
- **Deployment:** choose and document a single supported deployment path after the application structure is present.
- **Configuration:** environment variables for project URLs and public client keys; never commit service-role keys, database passwords, or other secrets.

### Supabase project

The selected Supabase project for Phase 1 is:

- **Project name:** `patientshell`
- **Project reference:** `djwuoubtiagupjenlwml`
- **Region:** `ap-south-1` (Mumbai)

The project was reachable and reported healthy during the initial connector inspection. At that inspection, no tables in the `public` schema, database migrations, or Edge Functions were listed. The application-to-Supabase connection and authentication flow have **not** yet been verified.

## Phase 1 priorities

1. Establish the repository structure and document how to run the app locally.
2. Inspect and align the frontend, backend, and Supabase configuration.
3. Define the initial schema and migrations before adding application data.
4. Enable RLS and add tested policies for every exposed table.
5. Configure and test authentication, including role-aware authorization.
6. Add automated checks and document the deployment process.
7. Verify the deployed application end-to-end before calling it production-ready.

## Security principles

- Do not commit `.env` files, credentials, access tokens, or private patient data.
- Use a publishable Supabase key in browser code only with correctly configured RLS and least-privilege grants.
- Keep Supabase secret/service-role keys on trusted server-side environments only.
- Treat health information as sensitive; use test data during development.
- Review access policies and security advisories before deployment.

## Current repository status

This repository is being initialized. Application source code, database migrations, automated tests, and deployment configuration must be inspected or added before the project can be considered runnable. Do not infer implementation from this overview alone.

## Contributing workflow

- Make changes on a feature or review branch.
- Open a pull request for review.
- Do not merge changes to `main` until the changes have been reviewed and validated.
