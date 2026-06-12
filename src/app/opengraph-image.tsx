import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OutsiderMap — ten thousand places, one answer";

// Deterministic pseudo-random scatter so the image is stable across builds.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function OgImage() {
  const rand = mulberry32(2026);
  const dots = Array.from({ length: 90 }, () => ({
    x: rand() * 1200,
    y: rand() * 630,
    s: 2 + rand() * 4,
    o: 0.25 + rand() * 0.6,
  }));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
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
            position: "absolute",
            left: 450,
            top: 165,
            width: 300,
            height: 300,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(240,164,49,0.35) 0%, rgba(240,164,49,0) 70%)",
          }}
        />
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            backgroundColor: "#f0a431",
            boxShadow: "0 0 60px 20px rgba(240,164,49,0.55)",
            marginBottom: 48,
          }}
        />
        <div
          style={{
            fontSize: 72,
            color: "#ede7db",
            textAlign: "center",
            lineHeight: 1.1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span>Ten thousand places.</span>
          <span style={{ color: "#f0a431", fontStyle: "italic" }}>
            One answer.
          </span>
        </div>
        <div
          style={{
            marginTop: 42,
            fontSize: 24,
            letterSpacing: 10,
            color: "#9b9183",
            textTransform: "uppercase",
          }}
        >
          OutsiderMap · Delhi
        </div>
      </div>
    ),
    size,
  );
}
