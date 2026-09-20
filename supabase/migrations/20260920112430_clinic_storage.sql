-- Supabase Storage bucket for catalog artwork.
-- The bucket is public for fast image delivery, but object writes and deletes
-- remain restricted to active Clinic administrators through Storage RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-images',
  'clinic-images',
  true,
  5242880,
  array['image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy clinic_images_admin_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'clinic-images'
  and name like 'clinic/%'
  and (select private.is_admin())
);

create policy clinic_images_admin_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'clinic-images'
  and name like 'clinic/%'
  and (select private.is_admin())
)
with check (
  bucket_id = 'clinic-images'
  and name like 'clinic/%'
  and (select private.is_admin())
);

create policy clinic_images_admin_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'clinic-images'
  and name like 'clinic/%'
  and (select private.is_admin())
);
