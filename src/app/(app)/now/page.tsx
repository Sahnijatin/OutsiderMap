import type { Metadata } from "next";
import { nowInIST } from "@/lib/places/hours";
import { NowSurface } from "./now-surface";

export const metadata: Metadata = {
  title: "Right now",
};

function greeting() {
  const { minutes } = nowInIST();
  const hour = Math.floor(minutes / 60);
  if (hour >= 5 && hour < 12) return "Morning. What's the move?";
  if (hour >= 12 && hour < 17) return "Afternoon. What do you need?";
  if (hour >= 17 && hour < 23) return "The city's awake. What do you want?";
  return "Still up. Good. What do you want?";
}

export default function NowPage() {
  const { minutes } = nowInIST();
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="voice">
          Delhi · {hh}:{mm}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl">{greeting()}</h1>
      </header>
      <NowSurface />
    </main>
  );
}
