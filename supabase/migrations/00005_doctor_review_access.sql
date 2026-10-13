-- Restricted validator for short-lived, patient-issued review tokens.
-- Raw tokens never enter the database; only SHA-256 hashes are stored.
create or replace function public.validate_doctor_review_token(
  p_token_hash text,
  p_package_id uuid,
  p_doctor_id uuid
)
returns table (package_id uuid, patient_id uuid)
language sql
security definer
set search_path = ''
stable
as $$
  select t.package_id, t.patient_id
  from public.temporary_access_tokens t
  join public.review_package_doctors g
    on g.package_id = t.package_id
   and g.patient_id = t.patient_id
   and g.doctor_id = p_doctor_id
  join public.user_profiles u on u.id = p_doctor_id and u.role = 'doctor'
  join public.doctor_profiles d on d.user_id = p_doctor_id and d.verification_status = 'verified'
  where t.token_hash = p_token_hash
    and t.package_id = p_package_id
    and t.expires_at > now()
    and t.revoked_at is null
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
    and p_doctor_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.validate_doctor_review_token(text, uuid, uuid) from public, anon;
grant execute on function public.validate_doctor_review_token(text, uuid, uuid) to authenticated;

-- Doctors can read/write only their own review records, while existing RLS
-- policies continue to constrain patient/package membership.


-- Audit review mutations inside the database transaction. Direct client inserts
-- into system_audit_events are intentionally not required/allowed by the API.
create or replace function public.audit_doctor_review_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.system_audit_events (
    actor_id, patient_id, event_type, resource_type, resource_id, metadata
  ) values (
    new.doctor_id, new.patient_id,
    case when new.status = 'completed' then 'doctor_review.resolved'
         when new.status = 'needs_information' then 'doctor_review.needs_information'
         else 'doctor_review.saved' end,
    'doctor_review', new.id,
    jsonb_build_object(
      'package_id', new.package_id,
      'status', new.status,
      'reviewed_at', new.reviewed_at
    )
  );
  return new;
end;
$$;

drop trigger if exists doctor_review_audit_change on public.doctor_reviews;
create trigger doctor_review_audit_change
after insert or update on public.doctor_reviews
for each row execute function public.audit_doctor_review_change();

create or replace function public.audit_doctor_resolution_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.system_audit_events (
    actor_id, patient_id, event_type, resource_type, resource_id, metadata
  ) values (
    new.doctor_id, new.patient_id, 'patient_question.responded',
    'doctor_review_resolution', new.id,
    jsonb_build_object(
      'question_id', new.question_id,
      'review_id', new.review_id
    )
  );
  return new;
end;
$$;

drop trigger if exists doctor_resolution_audit_insert on public.doctor_review_resolutions;
create trigger doctor_resolution_audit_insert
after insert on public.doctor_review_resolutions
for each row execute function public.audit_doctor_resolution_insert();

revoke all on function public.audit_doctor_review_change() from public, anon, authenticated;
revoke all on function public.audit_doctor_resolution_insert() from public, anon, authenticated;
