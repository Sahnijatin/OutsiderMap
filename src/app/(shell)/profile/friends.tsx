"use client";

import { Check, UserMinus, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatOutsiderNumber } from "@/lib/identity/username";
import type { FriendEntry, PublicMember } from "@/lib/friends/model";

type Lists = {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
};

const EMPTY: Lists = { friends: [], incoming: [], outgoing: [] };

/**
 * The friends panel: username typeahead to add, incoming requests to
 * accept/decline, outgoing to cancel, and the friends list itself. All
 * mutations are optimistic - the server is the source of truth on reload.
 */
export function FriendsPanel() {
  const [lists, setLists] = useState<Lists>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [armedRemove, setArmedRemove] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/friends");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as Lists;
        if (!cancelled) setLists(body);
      } catch {
        // Panel stays empty; a reload retries.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced typeahead, scheduled from the change handler (not an effect).
  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim().toLowerCase();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/friends/search?q=${encodeURIComponent(q)}`,
        );
        const body = (await res.json().catch(() => null)) as {
          members?: PublicMember[];
        } | null;
        setResults(body?.members ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  }

  const knownIds = new Set([
    ...lists.friends.map((f) => f.memberId),
    ...lists.incoming.map((f) => f.memberId),
    ...lists.outgoing.map((f) => f.memberId),
  ]);

  async function sendRequest(member: PublicMember) {
    setNotice(null);
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: member.username }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;
    if (!res?.ok || !body?.ok) {
      setNotice(body?.message ?? "That didn't go through - try again.");
      return;
    }
    setLists((prev) => ({
      ...prev,
      outgoing: [
        {
          friendshipId: `optimistic-${member.id}`,
          memberId: member.id,
          member,
          since: new Date().toISOString(),
        },
        ...prev.outgoing,
      ],
    }));
    setQuery("");
    setResults([]);
  }

  async function accept(entry: FriendEntry) {
    setLists((prev) => ({
      ...prev,
      incoming: prev.incoming.filter(
        (e) => e.friendshipId !== entry.friendshipId,
      ),
      friends: [entry, ...prev.friends],
    }));
    await fetch("/api/friends", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.friendshipId }),
    }).catch(() => {});
  }

  async function remove(entry: FriendEntry, from: keyof Lists) {
    setLists((prev) => ({
      ...prev,
      [from]: prev[from].filter((e) => e.friendshipId !== entry.friendshipId),
    }));
    // Optimistic outgoing rows haven't round-tripped an id yet.
    if (entry.friendshipId.startsWith("optimistic-")) return;
    await fetch("/api/friends", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.friendshipId }),
    }).catch(() => {});
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="voice">Friends</h2>

      <div className="flex flex-col gap-2">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find an outsider by username…"
          autoCapitalize="none"
          autoCorrect="off"
          className="rounded-card border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
        />
        {searching && (
          <p className="px-1 text-xs text-ink-dim">searching…</p>
        )}
        {results.length > 0 && (
          <ul className="flex flex-col gap-1">
            {results.map((m) => (
              <li key={m.id}>
                <MemberRow member={m}>
                  {knownIds.has(m.id) ? (
                    <span className="text-xs text-ink-dim">connected</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void sendRequest(m)}
                      className="flex items-center gap-1.5 rounded-full border border-accent/50 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
                    >
                      <UserPlus className="size-3.5" /> Add
                    </button>
                  )}
                </MemberRow>
              </li>
            ))}
          </ul>
        )}
        {notice && <p className="px-1 text-xs text-danger">{notice}</p>}
      </div>

      {!loaded ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          {lists.incoming.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-dim">
                Wants to connect ({lists.incoming.length})
              </p>
              <ul className="flex flex-col gap-1">
                {lists.incoming.map((e) => (
                  <li key={e.friendshipId}>
                    <MemberRow member={e.member}>
                      <button
                        type="button"
                        aria-label="Accept"
                        onClick={() => void accept(e)}
                        className="rounded-full bg-accent p-2 text-night transition-transform hover:-translate-y-0.5"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Decline"
                        onClick={() => void remove(e, "incoming")}
                        className="rounded-full border border-line p-2 text-ink-dim transition-colors hover:border-danger/50 hover:text-danger"
                      >
                        <X className="size-3.5" />
                      </button>
                    </MemberRow>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lists.outgoing.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-dim">Requested</p>
              <ul className="flex flex-col gap-1">
                {lists.outgoing.map((e) => (
                  <li key={e.friendshipId}>
                    <MemberRow member={e.member}>
                      <button
                        type="button"
                        onClick={() => void remove(e, "outgoing")}
                        className="text-xs text-ink-dim transition-colors hover:text-danger"
                      >
                        Cancel
                      </button>
                    </MemberRow>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lists.friends.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {lists.friends.map((e) => (
                <li key={e.friendshipId}>
                  <MemberRow member={e.member}>
                    <button
                      type="button"
                      aria-label={
                        armedRemove === e.friendshipId
                          ? "Confirm unfriend"
                          : "Unfriend"
                      }
                      onClick={() => {
                        if (armedRemove === e.friendshipId) {
                          setArmedRemove(null);
                          void remove(e, "friends");
                        } else {
                          setArmedRemove(e.friendshipId);
                        }
                      }}
                      onBlur={() => setArmedRemove(null)}
                      className={
                        armedRemove === e.friendshipId
                          ? "rounded-full bg-danger/20 p-2 text-danger"
                          : "rounded-full p-2 text-ink-dim/50 transition-colors hover:text-danger"
                      }
                    >
                      <UserMinus className="size-3.5" />
                    </button>
                  </MemberRow>
                </li>
              ))}
            </ul>
          ) : (
            lists.incoming.length === 0 &&
            lists.outgoing.length === 0 && (
              <Card>
                <p className="text-sm text-ink-dim">
                  No friends here yet. Search a username above, or share your
                  card - every outsider has a number worth asking about.
                </p>
              </Card>
            )
          )}
        </>
      )}
    </section>
  );
}

function MemberRow({
  member,
  children,
}: {
  member: PublicMember | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line/70 bg-surface px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raise font-display text-sm italic text-accent">
          {member?.username?.charAt(0).toUpperCase() ?? "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">
            @{member?.username ?? "unknown"}
          </p>
          <p className="font-mono text-[0.65rem] text-ink-dim">
            outsider {formatOutsiderNumber(member?.outsider_number)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
