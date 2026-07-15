import type { MetadataRoute } from "next";

/** Installable PWA: the map opens full screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OutsiderMap",
    short_name: "Outsider",
    description:
      "Only the places worth leaving the house for. Your city, curated and mapped.",
    id: "/map",
    start_url: "/map",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0a08",
    theme_color: "#0c0a08",
    categories: ["travel", "lifestyle", "food"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
