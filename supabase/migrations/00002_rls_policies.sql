-- RLS and grants for the Patientshell schema.
-- Policies apply only to authenticated users. No anon policy is defined.
-- Doctor access is package-scoped and expires/revokes with the explicit grant.

alter table public.user_profiles enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.medical_visits enable row level security;
alter table public.medical_documents enable row level security;
alter table public.extracted_document_data enable row level security;
alter table public.lab_records enable row level security;
alter table public.medication_records enable row level security;
alter table public.review_packages enable row level security;
alter table public.review_package_doctors enable row level security;
alter table public.review_package_documents enable row level security;
alter table public.review_package_visits enable row level security;
alter table public.temporary_access_tokens enable row level security;
alter table public.patient_questions enable row level security;
alter table public.doctor_reviews enable row level security;
alter table public.doctor_review_resolutions enable row level security;
alter table public.system_audit_events enable row level security;

revoke all on table
  public.user_profiles, public.patient_profiles, public.doctor_profiles,
  public.medical_visits, public.medical_documents, public.extracted_document_data,
  public.lab_records, public.medication_records, public.review_packages,
  public.review_package_doctors, public.review_package_documents,
  public.review_package_visits, public.temporary_access_tokens,
  public.patient_questions, public.doctor_reviews,
  public.doctor_review_resolutions, public.system_audit_events
from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.user_profiles, public.patient_profiles, public.doctor_profiles,
  public.medical_visits, public.medical_documents, public.extracted_document_data,
  public.lab_records, public.medication_records, public.review_packages,
  public.review_package_doctors, public.review_package_documents,
  public.review_package_visits, public.temporary_access_tokens,
  public.patient_questions, public.doctor_reviews,
  public.doctor_review_resolutions, public.system_audit_events
to authenticated;

-- User profiles: a user may read their own row and update ordinary patient
-- profile fields, but cannot self-promote into doctor/admin or delete the row.
create policy user_profiles_select_self
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy user_profiles_insert_patient_self
  on public.user_profiles for insert to authenticated
  with check ((select auth.uid()) = id and role = 'patient');

create policy user_profiles_update_patient_self
  on public.user_profiles for update to authenticated
  using ((select auth.uid()) = id and role = 'patient')
  with check ((select auth.uid()) = id and role = 'patient');

-- Patient profile owner only.
create policy patient_profiles_select_self
  on public.patient_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy patient_profiles_insert_self
  on public.patient_profiles for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid()) and up.role = 'patient'
    )
  );

create policy patient_profiles_update_self
  on public.patient_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid()) and up.role = 'patient'
    )
  );

-- Doctor credentials are provisioned by a trusted backend/admin workflow.
-- A doctor can read their own profile, but cannot self-verify or edit licensing.
create policy doctor_profiles_select_self
  on public.doctor_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

-- Patient-owned clinical records: SELECT / INSERT / UPDATE only for the owner.
-- Doctors receive SELECT only through a live package grant and package membership.
create policy medical_visits_select_patient_or_granted_doctor
  on public.medical_visits for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1
      from public.review_package_visits pv
      join public.review_package_doctors pg on pg.package_id = pv.package_id
      where pv.visit_id = medical_visits.id
        and pv.patient_id = medical_visits.patient_id
        and pg.patient_id = medical_visits.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy medical_visits_insert_patient
  on public.medical_visits for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy medical_visits_update_patient
  on public.medical_visits for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()));

create policy medical_documents_select_patient_or_granted_doctor
  on public.medical_documents for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1
      from public.review_package_documents pd
      join public.review_package_doctors pg on pg.package_id = pd.package_id
      where pd.document_id = medical_documents.id
        and pd.patient_id = medical_documents.patient_id
        and pg.patient_id = medical_documents.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy medical_documents_insert_patient
  on public.medical_documents for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and (uploaded_by is null or uploaded_by = (select auth.uid()))
  );

create policy medical_documents_update_patient
  on public.medical_documents for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (
    patient_id = (select auth.uid())
    and (uploaded_by is null or uploaded_by = (select auth.uid()))
  );

create policy extracted_document_data_select_patient_or_granted_doctor
  on public.extracted_document_data for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1
      from public.review_package_documents pd
      join public.review_package_doctors pg on pg.package_id = pd.package_id
      where pd.document_id = extracted_document_data.document_id
        and pd.patient_id = extracted_document_data.patient_id
        and pg.patient_id = extracted_document_data.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy extracted_document_data_insert_patient
  on public.extracted_document_data for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy extracted_document_data_update_patient_or_granted_doctor
  on public.extracted_document_data for update to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1
      from public.review_package_documents pd
      join public.review_package_doctors pg on pg.package_id = pd.package_id
      where pd.document_id = extracted_document_data.document_id
        and pd.patient_id = extracted_document_data.patient_id
        and pg.patient_id = extracted_document_data.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  )
  with check (
    patient_id = (select auth.uid())
    or exists (
      select 1
      from public.review_package_documents pd
      join public.review_package_doctors pg on pg.package_id = pd.package_id
      where pd.document_id = extracted_document_data.document_id
        and pd.patient_id = extracted_document_data.patient_id
        and pg.patient_id = extracted_document_data.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy lab_records_select_patient_or_granted_doctor
  on public.lab_records for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1
      from public.review_package_documents pd
      join public.review_package_doctors pg on pg.package_id = pd.package_id
      where pd.document_id = lab_records.document_id
        and pd.patient_id = lab_records.patient_id
        and pg.patient_id = lab_records.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
    or exists (
      select 1
      from public.review_package_visits pv
      join public.review_package_doctors pg on pg.package_id = pv.package_id
      where pv.visit_id = lab_records.visit_id
        and pv.patient_id = lab_records.patient_id
        and pg.patient_id = lab_records.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy lab_records_insert_patient
  on public.lab_records for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy lab_records_update_patient
  on public.lab_records for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()));

create policy medication_records_select_patient_or_granted_doctor
  on public.medication_records for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1
      from public.review_package_documents pd
      join public.review_package_doctors pg on pg.package_id = pd.package_id
      where pd.document_id = medication_records.document_id
        and pd.patient_id = medication_records.patient_id
        and pg.patient_id = medication_records.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
    or exists (
      select 1
      from public.review_package_visits pv
      join public.review_package_doctors pg on pg.package_id = pv.package_id
      where pv.visit_id = medication_records.visit_id
        and pv.patient_id = medication_records.patient_id
        and pg.patient_id = medication_records.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy medication_records_insert_patient
  on public.medication_records for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy medication_records_update_patient
  on public.medication_records for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()));

-- Package owner controls sharing and membership. Doctor access is read-only
-- and exists only while the matching grant is active.
create policy review_packages_select_patient_or_granted_doctor
  on public.review_packages for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1 from public.review_package_doctors pg
      where pg.package_id = review_packages.id
        and pg.patient_id = review_packages.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy review_packages_insert_patient
  on public.review_packages for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and created_by = (select auth.uid())
  );

create policy review_packages_update_patient
  on public.review_packages for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()));

create policy review_package_doctors_select_patient_or_assigned_doctor
  on public.review_package_doctors for select to authenticated
  using (
    patient_id = (select auth.uid())
    or (
      doctor_id = (select auth.uid())
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    )
  );

create policy review_package_doctors_insert_patient
  on public.review_package_doctors for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and granted_by = (select auth.uid())
    and revoked_at is null
  );

create policy review_package_doctors_update_patient
  on public.review_package_doctors for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (
    patient_id = (select auth.uid())
    and granted_by = (select auth.uid())
  );

create policy review_package_documents_select_patient_or_granted_doctor
  on public.review_package_documents for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1 from public.review_package_doctors pg
      where pg.package_id = review_package_documents.package_id
        and pg.patient_id = review_package_documents.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy review_package_documents_insert_patient
  on public.review_package_documents for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy review_package_documents_delete_patient
  on public.review_package_documents for delete to authenticated
  using (patient_id = (select auth.uid()));

create policy review_package_visits_select_patient_or_granted_doctor
  on public.review_package_visits for select to authenticated
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1 from public.review_package_doctors pg
      where pg.package_id = review_package_visits.package_id
        and pg.patient_id = review_package_visits.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy review_package_visits_insert_patient
  on public.review_package_visits for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy review_package_visits_delete_patient
  on public.review_package_visits for delete to authenticated
  using (patient_id = (select auth.uid()));

-- Temporary token hashes are intentionally backend-only. No authenticated
-- policy grants direct read/write access to this table.
-- Questions are visible to the owner and to the assigned doctor for the
-- package attached to the question.
create policy patient_questions_select_patient_or_granted_doctor
  on public.patient_questions for select to authenticated
  using (
    patient_id = (select auth.uid())
    or (
      package_id is not null
      and exists (
        select 1 from public.review_package_doctors pg
        where pg.package_id = patient_questions.package_id
          and pg.patient_id = patient_questions.patient_id
          and pg.doctor_id = (select auth.uid())
          and pg.revoked_at is null
          and (pg.expires_at is null or pg.expires_at > now())
      )
    )
  );

create policy patient_questions_insert_patient
  on public.patient_questions for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy patient_questions_update_patient_or_granted_doctor
  on public.patient_questions for update to authenticated
  using (
    patient_id = (select auth.uid())
    or (
      package_id is not null
      and exists (
        select 1 from public.review_package_doctors pg
        where pg.package_id = patient_questions.package_id
          and pg.patient_id = patient_questions.patient_id
          and pg.doctor_id = (select auth.uid())
          and pg.revoked_at is null
          and (pg.expires_at is null or pg.expires_at > now())
      )
    )
  )
  with check (
    patient_id = (select auth.uid())
    or (
      package_id is not null
      and exists (
        select 1 from public.review_package_doctors pg
        where pg.package_id = patient_questions.package_id
          and pg.patient_id = patient_questions.patient_id
          and pg.doctor_id = (select auth.uid())
          and pg.revoked_at is null
          and (pg.expires_at is null or pg.expires_at > now())
      )
    )
  );

create policy doctor_reviews_select_patient_or_assigned_doctor
  on public.doctor_reviews for select to authenticated
  using (
    patient_id = (select auth.uid())
    or (
      doctor_id = (select auth.uid())
      and exists (
        select 1 from public.review_package_doctors pg
        where pg.package_id = doctor_reviews.package_id
          and pg.patient_id = doctor_reviews.patient_id
          and pg.doctor_id = (select auth.uid())
          and pg.revoked_at is null
          and (pg.expires_at is null or pg.expires_at > now())
      )
    )
  );

create policy doctor_reviews_insert_assigned_doctor
  on public.doctor_reviews for insert to authenticated
  with check (
    doctor_id = (select auth.uid())
    and exists (
      select 1 from public.review_package_doctors pg
      where pg.package_id = doctor_reviews.package_id
        and pg.patient_id = doctor_reviews.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy doctor_reviews_update_assigned_doctor
  on public.doctor_reviews for update to authenticated
  using (
    doctor_id = (select auth.uid())
    and exists (
      select 1 from public.review_package_doctors pg
      where pg.package_id = doctor_reviews.package_id
        and pg.patient_id = doctor_reviews.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  )
  with check (
    doctor_id = (select auth.uid())
    and exists (
      select 1 from public.review_package_doctors pg
      where pg.package_id = doctor_reviews.package_id
        and pg.patient_id = doctor_reviews.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy doctor_review_resolutions_select_patient_or_assigned_doctor
  on public.doctor_review_resolutions for select to authenticated
  using (
    patient_id = (select auth.uid())
    or (
      doctor_id = (select auth.uid())
      and exists (
        select 1 from public.doctor_reviews dr
        join public.review_package_doctors pg on pg.package_id = dr.package_id
        where dr.id = doctor_review_resolutions.review_id
          and dr.patient_id = doctor_review_resolutions.patient_id
          and pg.patient_id = doctor_review_resolutions.patient_id
          and pg.doctor_id = (select auth.uid())
          and pg.revoked_at is null
          and (pg.expires_at is null or pg.expires_at > now())
      )
    )
  );

create policy doctor_review_resolutions_insert_assigned_doctor
  on public.doctor_review_resolutions for insert to authenticated
  with check (
    doctor_id = (select auth.uid())
    and exists (
      select 1 from public.doctor_reviews dr
      join public.review_package_doctors pg on pg.package_id = dr.package_id
      where dr.id = doctor_review_resolutions.review_id
        and dr.patient_id = doctor_review_resolutions.patient_id
        and dr.doctor_id = (select auth.uid())
        and pg.patient_id = doctor_review_resolutions.patient_id
        and pg.doctor_id = (select auth.uid())
        and pg.revoked_at is null
        and (pg.expires_at is null or pg.expires_at > now())
    )
  );

create policy system_audit_events_select_patient_or_actor
  on public.system_audit_events for select to authenticated
  using (
    actor_id = (select auth.uid())
    or patient_id = (select auth.uid())
  );

-- No INSERT / UPDATE / DELETE policies for audit events or temporary tokens:
-- trusted server-side code is responsible for these sensitive operations.
