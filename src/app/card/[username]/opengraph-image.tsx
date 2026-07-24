import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getPublicTasteCard } from "@/lib/taste/card";
import { formatOutsiderNumber } from "@/lib/identity/username";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A taste card on OutsiderMap";

// Deterministic scatter (matches the brand OG's technique) so a card is stable.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First sentence (or a trimmed head) of the taste read, for the card line. */
function tasteLine(summary: string): string {
  const first = summary.split(/(?<=[.!?])\s/)[0] ?? summary;
  return first.length > 150 ? `${first.slice(0, 147).trimEnd()}…` : first;
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let card = null;
  try {
    card = await getPublicTasteCard(await createClient(), username);
  } catch {
    card = null;
  }

  const rand = mulberry32(2027);
  const dots = Array.from({ length: 70 }, () => ({
    x: rand() * 1200,
    y: rand() * 630,
    s: 2 + rand() * 4,
    o: 0.2 + rand() * 0.5,
  }));

  const who = card ? (card.displayName ?? `@${card.username}`) : "OutsiderMap";
  const line = card
    ? tasteLine(card.tasteSummary)
    : "Ten thousand places. One answer.";
  const vibes = card ? card.vibeKeywords.slice(0, 4) : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 90px",
          backgroundColor: "#0c0a08",
          position: "relative",
        }}
      >
        {dots.map((d, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: d.x,
              top: d.y,
              width: d.s,
              height: d.s,
              borderRadius: 999,
              backgroundColor: "#f0a431",
              opacity: d.o,
            }}
          />
        ))}
        <div
          style={{
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#f0a431",
          }}
        >
          outsider {card ? formatOutsiderNumber(card.outsiderNumber) : "-"}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 60,
            color: "#ede7db",
            fontStyle: "italic",
          }}
        >
          {who}
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 34,
            lineHeight: 1.35,
            color: "#ede7db",
            maxWidth: 900,
            display: "flex",
          }}
        >
          {line}
        </div>
        {vibes.length > 0 && (
          <div style={{ marginTop: 34, display: "flex", gap: 14 }}>
            {vibes.map((v) => (
              <div
                key={v}
                style={{
                  fontSize: 24,
                  color: "#f0a431",
                  border: "1px solid rgba(240,164,49,0.4)",
                  borderRadius: 999,
                  padding: "8px 20px",
                }}
              >
                {v}
              </div>
            ))}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 90,
            bottom: 70,
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#9b9183",
          }}
        >
          OutsiderMap · your taste, mapped
        </div>
      </div>
    ),
    size,
  );
}
