-- Patientshell initial clinical schema.
-- Run through Supabase migrations; this file does not apply itself to any project.

create extension if not exists pgcrypto;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'patient' check (role in ('patient', 'doctor', 'admin')),
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patient_profiles (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  date_of_birth date,
  sex_at_birth text,
  blood_type text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctor_profiles (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  license_number text unique,
  specialty text,
  organization_name text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medical_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  doctor_id uuid references public.doctor_profiles(user_id) on delete set null,
  visit_type text,
  status text not null default 'recorded'
    check (status in ('scheduled', 'completed', 'cancelled', 'recorded')),
  started_at timestamptz,
  ended_at timestamptz,
  facility_name text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create table public.medical_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  visit_id uuid references public.medical_visits(id) on delete set null,
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  document_type text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'processed', 'failed', 'review_required')),
  document_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_path)
);

create table public.extracted_document_data (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  document_id uuid not null references public.medical_documents(id) on delete cascade,
  extracted_data jsonb not null default '{}'::jsonb,
  extraction_model text,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'confirmed', 'corrected', 'rejected')),
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, id)
);

create table public.lab_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  document_id uuid references public.medical_documents(id) on delete set null,
  visit_id uuid references public.medical_visits(id) on delete set null,
  test_name text not null,
  result_value text,
  unit text,
  reference_range text,
  result_flag text check (result_flag is null or result_flag in ('low', 'normal', 'high', 'critical', 'unknown')),
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medication_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  document_id uuid references public.medical_documents(id) on delete set null,
  visit_id uuid references public.medical_visits(id) on delete set null,
  medication_name text not null,
  dosage text,
  route text,
  frequency text,
  instructions text,
  prescribed_by uuid references public.doctor_profiles(user_id) on delete set null,
  started_on date,
  ended_on date,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'discontinued', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create table public.review_packages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  title text not null,
  purpose text,
  status text not null default 'draft'
    check (status in ('draft', 'shared', 'in_review', 'completed', 'revoked', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Explicit grants are per package; a doctor receives no access without a live grant.
create table public.review_package_doctors (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.review_packages(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  granted_by uuid not null references public.user_profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, doctor_id),
  check (expires_at is null or expires_at > granted_at)
);

create table public.review_package_documents (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.review_packages(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  document_id uuid not null references public.medical_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (package_id, document_id)
);

create table public.review_package_visits (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.review_packages(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  visit_id uuid not null references public.medical_visits(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (package_id, visit_id)
);

create table public.temporary_access_tokens (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.review_packages(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.patient_questions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  package_id uuid references public.review_packages(id) on delete set null,
  question text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctor_reviews (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.review_packages(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete restrict,
  summary text,
  recommendations text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'needs_information')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, doctor_id)
);

create table public.doctor_review_resolutions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.doctor_reviews(id) on delete cascade,
  question_id uuid references public.patient_questions(id) on delete set null,
  patient_id uuid not null references public.patient_profiles(user_id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete restrict,
  resolution text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.system_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.user_profiles(id) on delete set null,
  patient_id uuid references public.patient_profiles(user_id) on delete set null,
  event_type text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index medical_visits_patient_started_idx on public.medical_visits(patient_id, started_at desc);
create index medical_visits_doctor_idx on public.medical_visits(doctor_id);
create index medical_documents_patient_created_idx on public.medical_documents(patient_id, created_at desc);
create index extracted_document_data_patient_idx on public.extracted_document_data(patient_id);
create index extracted_document_data_document_idx on public.extracted_document_data(document_id);
create index lab_records_patient_observed_idx on public.lab_records(patient_id, observed_at desc);
create index medication_records_patient_status_idx on public.medication_records(patient_id, status);
create index review_packages_patient_idx on public.review_packages(patient_id, created_at desc);
create index review_package_doctors_doctor_idx on public.review_package_doctors(doctor_id, package_id);
create index review_package_doctors_patient_idx on public.review_package_doctors(patient_id, package_id);
create index review_package_documents_document_idx on public.review_package_documents(document_id);
create index review_package_visits_visit_idx on public.review_package_visits(visit_id);
create index temporary_access_tokens_patient_idx on public.temporary_access_tokens(patient_id, expires_at);
create index patient_questions_patient_status_idx on public.patient_questions(patient_id, status);
create index doctor_reviews_patient_idx on public.doctor_reviews(patient_id, created_at desc);
create index doctor_reviews_doctor_idx on public.doctor_reviews(doctor_id, created_at desc);
create index doctor_review_resolutions_patient_idx on public.doctor_review_resolutions(patient_id, created_at desc);
create index system_audit_events_patient_created_idx on public.system_audit_events(patient_id, created_at desc);
create index system_audit_events_actor_created_idx on public.system_audit_events(actor_id, created_at desc);
