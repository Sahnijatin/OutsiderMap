"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDevicePosition } from "@/lib/map/geolocation";
import { captureNativePhoto } from "@/lib/media/camera";
import { useIsNativeApp } from "@/lib/capacitor/platform";
import { success, tap, warn } from "@/lib/native/haptics";
import { playSound } from "@/lib/sound/engine";
import {
  SCOUT_EVIDENCE_BUCKET,
  scoutEvidencePrefix,
} from "@/lib/scout/capture";

/**
 * Client surfaces for the Scout Economy. SubmitSpotForm lets a scout list a
 * hidden place (spawning a verify bounty); ConfirmFlow is the on-site
 * verification - live camera capture + device geolocation, screened + gated
 * server-side. Location comes from the shared geolocation seam, so it's native
 * GPS in the app and `navigator.geolocation` on the web.
 */

// Bucket + owner-prefix come from the shared capture module so the client and
// the server-side evidence checks can never drift apart.
const CAPTURE_BUCKET = SCOUT_EVIDENCE_BUCKET;

export function SubmitSpotForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const pos = await getDevicePosition();
      const res = await fetch("/api/scout/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          area: area || undefined,
          lat: pos.latitude,
          lng: pos.longitude,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't submit.");
      setMsg("Submitted - other members will verify it on-site.");
      playSound("success");
      success();
      setName("");
      setArea("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <p className="voice">list a hidden spot</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Place name"
        className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink"
      />
      <input
        value={area}
        onChange={(e) => setArea(e.target.value)}
        placeholder="Area (optional)"
        className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink"
      />
      <button
        type="button"
        disabled={busy || name.trim().length < 2}
        onClick={submit}
        className="rounded-full bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit from my location"}
      </button>
      {msg && <p className="text-xs text-ink-dim">{msg}</p>}
    </div>
  );
}

export function ConfirmFlow({ bountyId }: { bountyId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isNative = useIsNativeApp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Native capture result (the app uses the real camera instead of an input).
  const [shot, setShot] = useState<File | null>(null);

  // On-site verification has to be a *live* photo, so native forces the camera
  // (CameraSource.Camera) - no picking an old gallery shot.
  async function takePhoto() {
    setMsg(null);
    try {
      const file = await captureNativePhoto("camera");
      if (file) {
        setShot(file);
        tap();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  }

  async function confirm(verdict: "exists" | "not_exists") {
    const file = shot ?? fileRef.current?.files?.[0];
    if (!file) {
      setMsg("Capture a live photo first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const pos = await getDevicePosition();
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      // Keep the stored extension honest - native capture may hand back png/webp.
      const ext = (file.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
      const path = `${scoutEvidencePrefix(user.id)}${bountyId}-${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from(CAPTURE_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw new Error(up.error.message);

      const res = await fetch(`/api/bounties/${bountyId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verdict,
          media: { source: "camera", bucket: CAPTURE_BUCKET, path, kind: "image" },
          capturedLat: pos.latitude,
          capturedLng: pos.longitude,
          capturedAt: new Date().toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't confirm.");
      setMsg("Verification submitted. Thank you for scouting.");
      setShot(null);
      playSound("success");
      success();
      router.refresh();
    } catch (e) {
      warn();
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {isNative ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={takePhoto}
            disabled={busy}
            className="rounded-full border border-line px-3 py-1.5 text-xs text-ink disabled:opacity-50"
          >
            {shot ? "Retake photo" : "Take photo"}
          </button>
          {shot && <span className="text-xs text-ink-dim">Photo ready</span>}
        </div>
      ) : (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="text-xs text-ink-dim"
        />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => confirm("exists")}
          className="rounded-full bg-ink px-3 py-1.5 text-xs text-bg disabled:opacity-50"
        >
          It exists
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => confirm("not_exists")}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-dim disabled:opacity-50"
        >
          Couldn&apos;t find it
        </button>
      </div>
      {msg && <p className="text-xs text-ink-dim">{msg}</p>}
    </div>
  );
}
