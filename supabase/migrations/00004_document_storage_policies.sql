-- Private storage for patient medical documents.
-- Object ownership is assigned by Supabase Storage from the authenticated JWT.
-- Restrict both owner_id and the first path segment to the authenticated patient.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical-records',
  'medical-records',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists medical_records_insert_owner on storage.objects;
create policy medical_records_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'medical-records'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists medical_records_select_owner on storage.objects;
create policy medical_records_select_owner
on storage.objects for select to authenticated
using (
  bucket_id = 'medical-records'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists medical_records_update_owner on storage.objects;
create policy medical_records_update_owner
on storage.objects for update to authenticated
using (
  bucket_id = 'medical-records'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'medical-records'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists medical_records_delete_owner on storage.objects;
create policy medical_records_delete_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'medical-records'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- The existing medical_documents and extracted_document_data RLS policies
-- continue to enforce patient_id = auth.uid() at the database layer.


-- Trusted audit triggers run with narrowly scoped definer rights, because clients
-- must not be allowed to write arbitrary audit events themselves.
create or replace function public.audit_medical_document_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.system_audit_events (
    actor_id, patient_id, event_type, resource_type, resource_id, metadata
  ) values (
    (select auth.uid()), new.patient_id, 'medical_document.uploaded',
    'medical_document', new.id,
    jsonb_build_object(
      'file_name', new.file_name,
      'mime_type', new.mime_type,
      'file_size_bytes', new.file_size_bytes,
      'processing_status', new.processing_status
    )
  );
  return new;
end;
$$;

drop trigger if exists medical_document_insert_audit on public.medical_documents;
create trigger medical_document_insert_audit
after insert on public.medical_documents
for each row execute function public.audit_medical_document_insert();

create or replace function public.audit_extracted_data_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.review_status is distinct from old.review_status
     or new.extracted_data is distinct from old.extracted_data then
    insert into public.system_audit_events (
      actor_id, patient_id, event_type, resource_type, resource_id, metadata
    ) values (
      coalesce(new.reviewed_by, (select auth.uid())),
      new.patient_id,
      'extracted_document_data.reviewed',
      'extracted_document_data',
      new.id,
      jsonb_build_object(
        'document_id', new.document_id,
        'previous_review_status', old.review_status,
        'new_review_status', new.review_status,
        'previous_extracted_data', old.extracted_data,
        'new_extracted_data', new.extracted_data,
        'reviewed_at', new.reviewed_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists extracted_data_review_audit on public.extracted_document_data;
create trigger extracted_data_review_audit
after update on public.extracted_document_data
for each row execute function public.audit_extracted_data_review();

revoke all on function public.audit_medical_document_insert() from public, anon, authenticated;
revoke all on function public.audit_extracted_data_review() from public, anon, authenticated;
