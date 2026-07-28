/**
 * Optional Airtable push - same records as the Candidates sheet, for teams
 * that verify in Airtable instead of Excel. Set:
 *   AIRTABLE_API_KEY  (personal access token with data.records:write)
 *   AIRTABLE_BASE_ID  (appXXXXXXXXXXXXXX)
 *   AIRTABLE_TABLE    (table name, e.g. "Candidates")
 * Field names mirror the sheet headers; create them in the base first.
 */

export async function pushToAirtable(accepted, { apiKey, baseId, table }) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  let pushed = 0;
  // Airtable caps create calls at 10 records.
  for (let i = 0; i < accepted.length; i += 10) {
    const batch = accepted.slice(i, i + 10).map((p) => ({
      fields: {
        Name: p.name,
        Category: p.category,
        City: p.cityName,
        State: p.state,
        Address: p.address ?? "",
        Lat: p.lat,
        Lng: p.lng,
        Rating: p.rating,
        Reviews: p.reviewCount,
        Price: p.priceLevel,
        Score: p.score,
        Sources: p.sources.join(", "),
        "Story signals": p.storySignals
          .map((s) => `[${s.tag}] "${s.quote}" (${s.source})`)
          .join("\n"),
        Website: p.website ?? "",
        "Maps URL": p.mapsUrl ?? "",
        Status: "pending",
      },
    }));
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    if (!res.ok) {
      throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    pushed += batch.length;
  }
  return pushed;
}
