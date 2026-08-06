"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * The rights that had no way to be exercised.
 *
 * Access (§11) had no route at all - deletion shipped, the read side never
 * did. Correction (§12) existed only for the fields a member could already
 * edit. Nomination (§14) did not exist. And POST /api/grievances, the one
 * piece of machinery that was already built, had no caller anywhere in the app
 * - so even once an officer is appointed there was no way to reach them.
 *
 * All four live here, in one card, next to the delete button people already
 * know how to find.
 */

type Panel = "none" | "nominee" | "correction";

export function DataRightsCard({
  nominee,
  officerEmail,
}: {
  nominee: { name: string; email: string | null; phone: string | null } | null;
  officerEmail: string | null;
}) {
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nomineeName, setNomineeName] = useState(nominee?.name ?? "");
  const [nomineeEmail, setNomineeEmail] = useState(nominee?.email ?? "");
  const [correction, setCorrection] = useState("");

  async function saveNominee() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/nominee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nomineeName, email: nomineeEmail }),
      });
      if (!res.ok) throw new Error();
      setNote("Saved. They'll need to contact our grievance officer to act.");
      setPanel("none");
    } catch {
      setError("Couldn't save that. A name and an email are both required.");
    } finally {
      setBusy(false);
    }
  }

  async function fileCorrection() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/grievances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Reuses the grievance register rather than adding a second queue: it
        // already has RLS, an SLA clock, an officer field and an appeal path.
        body: JSON.stringify({ category: "data_correction", body: correction }),
      });
      if (!res.ok) throw new Error();
      setNote("Filed. We'll respond within the timelines the DPDP Act sets.");
      setCorrection("");
      setPanel("none");
    } catch {
      setError("Couldn't file that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">Your data</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">
        Everything we hold about you, and the ways you can act on it.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* A navigation, not a fetch: the response is a streamed attachment,
            so letting the browser handle it avoids buffering the whole bundle
            into memory just to hand it back as a blob. */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.href = "/api/account/export";
          }}
        >
          Download my data
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPanel(panel === "correction" ? "none" : "correction")}
        >
          Request a correction
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPanel(panel === "nominee" ? "none" : "nominee")}
        >
          {nominee ? "Change your nominee" : "Nominate someone"}
        </Button>
      </div>

      {panel === "correction" && (
        <div className="mt-3 flex flex-col gap-2 rounded-card border border-line bg-raise p-3">
          <p className="text-xs leading-relaxed text-ink-dim">
            Your display name, bio and home area are editable above, remembered
            facts can be deleted from the memory card, and retaking the quiz
            rewrites your taste profile. Use this for the things you
            can&rsquo;t change yourself — your username, your date of birth, or
            your email.
          </p>
          <Input
            value={correction}
            maxLength={4000}
            placeholder="What's wrong, and what should it say?"
            onChange={(e) => setCorrection(e.target.value)}
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={busy || correction.trim().length < 5}
              onClick={() => void fileCorrection()}
            >
              {busy ? <Spinner className="border-night/30 border-t-night" /> : null}
              File it
            </Button>
          </div>
        </div>
      )}

      {panel === "nominee" && (
        <div className="mt-3 flex flex-col gap-2 rounded-card border border-line bg-raise p-3">
          <p className="text-xs leading-relaxed text-ink-dim">
            Under the DPDP Act you can name someone to exercise these rights for
            you if you die or become unable to. They cannot sign in and cannot
            act on your account — to use this they contact our grievance
            officer, who checks their claim against what you enter here.
          </p>
          <Input
            value={nomineeName}
            maxLength={120}
            placeholder="Their name"
            onChange={(e) => setNomineeName(e.target.value)}
          />
          <Input
            value={nomineeEmail}
            type="email"
            placeholder="Their email"
            onChange={(e) => setNomineeEmail(e.target.value)}
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={busy || nomineeName.trim().length < 2 || !nomineeEmail}
              onClick={() => void saveNominee()}
            >
              {busy ? <Spinner className="border-night/30 border-t-night" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-xs text-accent">{note}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {officerEmail && (
        <p className="mt-3 border-t border-line/40 pt-3 text-xs leading-relaxed text-ink-dim">
          Not satisfied with how we handled something? Our grievance officer is
          at{" "}
          <a
            href={`mailto:${officerEmail}`}
            className="underline hover:text-accent"
          >
            {officerEmail}
          </a>
          .
        </p>
      )}
    </div>
  );
}
