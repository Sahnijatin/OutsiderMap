# Moderation vendor selection (informs #91 items 5 & 7)

An engineering brief to inform two decisions. Both providers sit behind
swappable `server-only` interfaces, so selection is a config + adapter change,
not a re-architecture. Figures are indicative (2026) — confirm current pricing
and qualification terms with each vendor before committing.

## Image / video moderation (`ImageModerator`, #84)

| Provider | Accuracy | Cost (indicative) | Notes |
|----------|----------|-------------------|-------|
| **Hive** | Best-in-class multimodal | Higher per-call | Strong for nuanced visual + video; premium price |
| **AWS Rekognition** | Good | ~$1 / 1K images, ~$0.10 / min video | Cheapest at launch volume; already AWS-friendly |
| **Google Vision SafeSearch** | Good (images) | Low | Solid image SafeSearch; weaker video story |

**Recommendation:** start with **AWS Rekognition** as the budget default behind
`createImageModerator()` — lowest cost at launch volume, adequate accuracy, and
the confidence bands already route uncertain results to human review. Revisit
**Hive** if visual false-negatives prove costly. Video = sample frames
(`planFrameSamples`) + route audio→text through the existing text pipeline.

**Wiring when chosen:** implement the adapter in `src/lib/moderation/image.ts`,
map the provider's labels into the normalized `MODERATION_CATEGORIES`, and
return `decide(scores)`. Set the provider env (see `env.example`). Nothing else
changes.

## CSAM hash-matching (`CsamScanner`, #85 — legally mandatory)

| Tool | Cost | Fit |
|------|------|-----|
| **Microsoft PhotoDNA** | Free for qualifying platforms | Industry standard hash-matching; application/onboarding required |
| **Cloudflare CSAM Scanning Tool** | Free if media is fronted via Cloudflare | Lowest lift **if** already on Cloudflare |
| **Thorn Safer** | Paid | Broader classifier + hash-matching |

**Recommendation:** **PhotoDNA** if the platform qualifies (the standard, free),
or **Cloudflare's tool** if media is already served through Cloudflare (minimal
integration). This is **hash-matching, not an LLM/vision call** — keep it in the
isolated `csam.ts` path, never the general queue.

**Wiring when onboarded:** implement `createCsamScanner()` against the vendor;
on a hit, the existing `quarantineAndReport()` pulls the object and opens an
access-locked `csam_report`. The **authority reporting step** (SJPU/police per
IT Act §67B + POCSO §19) and evidence retention are legal determinations —
#91 items 6 & 8.

> Provider names and terms are references, not endorsements. Legal
> qualification (especially for CSAM tooling) must be confirmed with counsel.
