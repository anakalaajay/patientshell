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
