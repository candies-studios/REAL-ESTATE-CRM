-- =============================================================================
-- Property photos in Supabase Storage.
-- Bucket "property-media" is publicly readable (photos appear on the website).
-- Only owners/admins can upload, replace or delete, and only inside a folder
-- named after their own organization id:  <org_id>/<property_id>/<file>
-- Skipped automatically where the storage schema doesn't exist (local tests).
-- =============================================================================
do $outer$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('property-media', 'property-media', true, 8388608,
          array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "property media public read" on storage.objects for select
    using (bucket_id = 'property-media')
  $p$;
  execute $p$
    create policy "property media admin insert" on storage.objects for insert to authenticated
    with check (
      bucket_id = 'property-media'
      and public.has_role(((storage.foldername(name))[1])::uuid, '{owner,admin}')
    )
  $p$;
  execute $p$
    create policy "property media admin update" on storage.objects for update to authenticated
    using (bucket_id = 'property-media' and public.has_role(((storage.foldername(name))[1])::uuid, '{owner,admin}'))
    with check (bucket_id = 'property-media' and public.has_role(((storage.foldername(name))[1])::uuid, '{owner,admin}'))
  $p$;
  execute $p$
    create policy "property media admin delete" on storage.objects for delete to authenticated
    using (bucket_id = 'property-media' and public.has_role(((storage.foldername(name))[1])::uuid, '{owner,admin}'))
  $p$;
end
$outer$;
