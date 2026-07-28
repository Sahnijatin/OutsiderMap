/**
 * Instagram - INTENTIONALLY NOT A SCRAPER.
 *
 * Two hard walls, one legal principle:
 *  - Scraping IG requires an authenticated session and violates their ToS in
 *    a way that gets accounts banned, not just IPs.
 *  - Even legally OBTAINED media isn't legally USABLE: OutsiderMap's own
 *    schema (place_media, migration 41) encodes it - "crediting a creator is
 *    not a licence." Copying reels into the product is reproduction; the
 *    product embeds via URL + oEmbed, serving from the platform, or hosts
 *    only media it has a licence to.
 *
 * So Instagram enters this pipeline as CURATION, not scraping: the export
 * sheet carries `instagram_handle` and `reel_links` columns the human
 * verifier fills while validating a place (you're already looking at the
 * place - grabbing its handle takes seconds). Those URLs become embeds in
 * the product later, cleanly.
 *
 * This helper just normalizes pasted links during import back from the sheet.
 */

export function normalizeInstagramLinks(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/(www\.)?instagram\.com\//i.test(s))
    .map((s) => s.split("?")[0]);
}
