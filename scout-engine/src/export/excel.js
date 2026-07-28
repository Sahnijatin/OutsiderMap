import ExcelJS from "exceljs";

/**
 * The manual-verification workbook - the human layer is the product here, so
 * the sheet is designed for a reviewer, not a machine:
 *  - Candidates sheet sorted by score, with story evidence QUOTED next to
 *    each place so approving means reading, not googling.
 *  - Verification columns (status dropdown, speciality, story draft, IG
 *    handle, reel links, photo links) are the reviewer's workspace; they're
 *    what eventually ships into the product.
 *  - Rejected sheet keeps every gate-reject with its reason - auditability
 *    for "why isn't X here".
 */

const CANDIDATE_COLUMNS = [
  { header: "Score", key: "score", width: 7 },
  { header: "Name", key: "name", width: 30 },
  { header: "Category", key: "category", width: 12 },
  { header: "City", key: "cityName", width: 14 },
  { header: "State", key: "state", width: 14 },
  { header: "Address", key: "address", width: 34 },
  { header: "Lat", key: "lat", width: 10 },
  { header: "Lng", key: "lng", width: 10 },
  { header: "Rating", key: "rating", width: 8 },
  { header: "Reviews", key: "reviewCount", width: 9 },
  { header: "Price (1-4)", key: "priceLevel", width: 10 },
  { header: "Sources", key: "sources", width: 14 },
  { header: "Story signals (quoted evidence)", key: "signals", width: 70 },
  { header: "Website", key: "website", width: 26 },
  { header: "Maps URL", key: "mapsUrl", width: 26 },
  // ---- Reviewer workspace ----
  { header: "Status", key: "status", width: 12 },
  { header: "Speciality (verified)", key: "speciality", width: 30 },
  { header: "Story draft (verified)", key: "story", width: 60 },
  { header: "Instagram handle", key: "igHandle", width: 18 },
  { header: "Reel links (embed, never copy)", key: "reelLinks", width: 34 },
  { header: "Photo links (licensed only)", key: "photoLinks", width: 34 },
  { header: "Verifier notes", key: "notes", width: 40 },
];

export async function writeWorkbook(path, { accepted, rejected, errors, runMeta }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "scout-engine";

  const candidates = wb.addWorksheet("Candidates");
  candidates.columns = CANDIDATE_COLUMNS;
  for (const p of accepted) {
    const row = candidates.addRow({
      ...p,
      sources: p.sources.join(", "),
      signals: p.storySignals
        .map((s) => `[${s.tag}] "${s.quote}" (${s.source})`)
        .join("\n"),
      status: "pending",
    });
    row.getCell("signals").alignment = { wrapText: true, vertical: "top" };
  }
  candidates.getRow(1).font = { bold: true };
  candidates.autoFilter = { from: "A1", to: { row: 1, column: CANDIDATE_COLUMNS.length } };
  candidates.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  // Status as a dropdown so verification stays machine-readable.
  if (accepted.length > 0) {
    candidates.dataValidations.add(`P2:P${accepted.length + 1}`, {
      type: "list",
      allowBlank: false,
      formulae: ['"pending,approved,rejected,needs-visit"'],
    });
  }

  const rejects = wb.addWorksheet("Rejected (with reasons)");
  rejects.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "City", key: "cityName", width: 14 },
    { header: "Category", key: "category", width: 12 },
    { header: "Rating", key: "rating", width: 8 },
    { header: "Reviews", key: "reviewCount", width: 9 },
    { header: "Sources", key: "sources", width: 14 },
    { header: "Reject reason", key: "gateReason", width: 30 },
  ];
  for (const p of rejected) rejects.addRow({ ...p, sources: p.sources.join(", ") });
  rejects.getRow(1).font = { bold: true };

  const meta = wb.addWorksheet("Run");
  meta.columns = [
    { header: "Key", key: "k", width: 24 },
    { header: "Value", key: "v", width: 70 },
  ];
  for (const [k, v] of Object.entries(runMeta)) meta.addRow({ k, v: String(v) });
  for (const e of errors) {
    meta.addRow({ k: `error:${e.city}/${e.source}/${e.category}`, v: e.error });
  }
  meta.getRow(1).font = { bold: true };

  await wb.xlsx.writeFile(path);
}
