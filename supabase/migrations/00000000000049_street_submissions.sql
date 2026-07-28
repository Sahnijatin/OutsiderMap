-- Street submissions: the easiest possible way in for a place someone names
-- on the street - a Google Maps link, or just a name, plus an optional
-- comment. Submissions flow into the EXISTING ingest pipeline (extraction,
-- dedupe, admin review inbox) rather than a parallel system; two new
-- source_type values mark where they came from:
--
--   'maps'   - a Google Maps link (parsed from the URL itself + the official
--              Places API when a key is configured; google.com is never
--              scraped)
--   'member' - a name-only submission (pseudo URL member://submission/<id>)
--
-- The member's typed name / comment / city ride in raw_metadata (seeded at
-- insert, merged - not overwritten - during processing), and created_by is
-- the submitting member, which later feeds the scout-credit loop.

alter table public.ingest_items
  drop constraint ingest_items_source_type_check;

alter table public.ingest_items
  add constraint ingest_items_source_type_check
  check (source_type in ('instagram', 'youtube', 'blog', 'other', 'maps', 'member'));
