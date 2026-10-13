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
