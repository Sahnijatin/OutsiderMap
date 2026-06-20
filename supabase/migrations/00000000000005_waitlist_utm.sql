-- Phase 8: campaign attribution on waitlist signups.
--
-- Captured first-touch from the /join landing URL (utm_*) and the referring
-- page, so signups can be tied back to specific ads/channels. All nullable;
-- written by the same service-role server action that creates the row.

alter table public.waitlist
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add column utm_term text,
  add column utm_content text,
  add column referrer text;
