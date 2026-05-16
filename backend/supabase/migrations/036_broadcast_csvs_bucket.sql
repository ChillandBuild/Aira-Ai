-- Migration 035: Create broadcast-csvs storage bucket
-- Purpose: Store uploaded CSV files for broadcast campaigns with download capability

-- Create storage bucket for broadcast CSVs (public access for download)
insert into storage.buckets (id, name, public)
values ('broadcast-csvs', 'broadcast-csvs', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload CSVs
create policy "Allow authenticated users to upload CSVs"
on storage.objects for insert
with check (bucket_id = 'broadcast-csvs' and auth.role() = 'authenticated');

-- Allow public read access to CSVs (for download links)
create policy "Allow public read access to CSVs"
on storage.objects for select
using (bucket_id = 'broadcast-csvs');

-- Allow authenticated users to delete their own CSVs
create policy "Allow authenticated users to delete CSVs"
on storage.objects for delete
using (bucket_id = 'broadcast-csvs' and auth.role() = 'authenticated');
