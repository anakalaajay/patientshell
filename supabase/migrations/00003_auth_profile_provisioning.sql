-- Provision a patient-role application profile for each new Supabase Auth user.
-- Role is always assigned server-side as 'patient'; never trust user metadata for roles.

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, role, full_name, email)
  values (
    new.id,
    'patient',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
        updated_at = now();

  insert into public.patient_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_patientshell on auth.users;
create trigger on_auth_user_created_patientshell
after insert on auth.users
for each row execute function private.handle_new_auth_user();
