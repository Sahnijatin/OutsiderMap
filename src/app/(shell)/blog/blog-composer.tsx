"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/app/page-header";
import { Screen } from "@/components/app/screen";
import { cn } from "@/lib/utils";
import {
  ARTICLE_BLOCK_TYPES,
  MAX_ARTICLE_TITLE,
  type ArticleBlock,
  type ArticleBlockType,
} from "@/lib/blog/blocks";
import { CreateArticleSchema } from "@/lib/blog/compose";

type PlaceHit = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  category: string | null;
};

/** An editor row. `key` is local identity so React keeps inputs stable. */
type Draft = {
  key: string;
  type: ArticleBlockType;
  text: string;
  placeId: string | null;
  placeLabel: string | null;
  note: string;
};

const BLOCK_LABELS: Record<ArticleBlockType, string> = {
  paragraph: "Paragraph",
  heading: "Heading",
  quote: "Quote",
  place: "Place card",
};

const BLOCK_PLACEHOLDERS: Record<ArticleBlockType, string> = {
  paragraph: "What makes this place worth the trip?",
  heading: "A section title",
  quote: "Something someone said",
  place: "",
};

let seq = 0;
function newDraft(type: ArticleBlockType = "paragraph"): Draft {
  seq += 1;
  return {
    key: `b${seq}`,
    type,
    text: "",
    placeId: null,
    placeLabel: null,
    note: "",
  };
}

/** Editor rows -> the wire body, dropping rows the member left blank. */
function toBlocks(drafts: Draft[]): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  for (const d of drafts) {
    if (d.type === "place") {
      if (!d.placeId) continue;
      blocks.push({
        type: "place",
        place_id: d.placeId,
        ...(d.note.trim() ? { note: d.note.trim() } : {}),
      });
      continue;
    }
    const text = d.text.trim();
    if (!text) continue;
    blocks.push({ type: d.type, text });
  }
  return blocks;
}

/** Debounced catalog typeahead, shared by the anchor picker and place blocks. */
function usePlaceSearch(query: string, city: string, suppress: boolean) {
  const [hits, setHits] = useState<PlaceHit[]>([]);
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (suppress || q.length < 2) {
        setHits([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/places/search?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as { places?: PlaceHit[] };
        setHits(json.places ?? []);
      } catch {
        // Typeahead is best-effort; a failed lookup just shows nothing.
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, city, suppress]);
  return [hits, setHits] as const;
}

export function BlogComposer({
  homeCity,
  anchor = null,
}: {
  homeCity: string;
  /** Pre-selected place, when arriving from a place page. */
  anchor?: { id: string; label: string } | null;
}) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([newDraft()]);
  const [showInFeed, setShowInFeed] = useState(false);

  const [placeId, setPlaceId] = useState<string | null>(anchor?.id ?? null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(
    anchor?.label ?? null,
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = usePlaceSearch(
    placeQuery,
    homeCity,
    Boolean(placeId),
  );

  const [blockQuery, setBlockQuery] = useState<{ key: string; q: string } | null>(
    null,
  );
  const [blockHits, setBlockHits] = usePlaceSearch(
    blockQuery?.q ?? "",
    homeCity,
    false,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(key: string, next: Partial<Draft>) {
    setDrafts((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...next } : r)),
    );
  }

  function move(index: number, delta: number) {
    setDrafts((rows) => {
      const target = index + delta;
      if (target < 0 || target >= rows.length) return rows;
      const copy = [...rows];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      type: "article" as const,
      title,
      body: toBlocks(drafts),
      place_id: placeId ?? "",
      extra_place_ids: [] as string[],
      city: homeCity,
      show_in_feed: showInFeed,
    };
    const parsed = CreateArticleSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the blog and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(json?.message ?? json?.error ?? "That didn't publish. Try again.");
        setSubmitting(false);
        return;
      }
      router.push("/feed");
      router.refresh();
    } catch {
      setError("That didn't publish. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <Screen width="narrow">
      <PageHeader
        eyebrow="write"
        title="Tell the story of a place."
        lead="Long-form, anchored to a real spot. You choose who sees it."
      />

      <form onSubmit={submit} className="mt-2 flex flex-col gap-5">
        <Field label="Title" htmlFor="blog-title">
          <Input
            id="blog-title"
            value={title}
            maxLength={MAX_ARTICLE_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Seven cafes in Hauz Khas that aren't on Google"
          />
        </Field>

        <Field
          label="The place it's about"
          hint="Required - this is where the blog appears, and where readers land."
        >
          {placeId ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <span className="text-sm">{placeLabel}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlaceId(null);
                  setPlaceLabel(null);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="Search the catalog"
                aria-label="Search for the place this blog is about"
              />
              {placeHits.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {placeHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPlaceId(hit.id);
                          setPlaceLabel(
                            [hit.name, hit.area].filter(Boolean).join(" · "),
                          );
                          setPlaceQuery("");
                          setPlaceHits([]);
                        }}
                        className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-sm transition-colors hover:border-accent/50"
                      >
                        {hit.name}
                        {hit.area && (
                          <span className="text-ink-dim"> · {hit.area}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="voice mb-1">The blog</legend>
          {drafts.map((draft, index) => (
            <div
              key={draft.key}
              className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-center gap-2">
                <Select
                  value={draft.type}
                  aria-label={`Block ${index + 1} type`}
                  onChange={(e) =>
                    patch(draft.key, {
                      type: e.target.value as ArticleBlockType,
                    })
                  }
                  className="w-auto"
                >
                  {ARTICLE_BLOCK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BLOCK_LABELS[t]}
                    </option>
                  ))}
                </Select>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Move block ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Move block ${index + 1} down`}
                    disabled={index === drafts.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove block ${index + 1}`}
                    disabled={drafts.length === 1}
                    onClick={() =>
                      setDrafts((rows) => rows.filter((r) => r.key !== draft.key))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>

              {draft.type === "place" ? (
                <div className="flex flex-col gap-2">
                  {draft.placeId ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raise px-4 py-2.5">
                      <span className="text-sm">{draft.placeLabel}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patch(draft.key, { placeId: null, placeLabel: null })
                        }
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={
                          blockQuery?.key === draft.key ? blockQuery.q : ""
                        }
                        onChange={(e) =>
                          setBlockQuery({ key: draft.key, q: e.target.value })
                        }
                        placeholder="Search for a place to feature"
                        aria-label={`Search a place for block ${index + 1}`}
                      />
                      {blockQuery?.key === draft.key && blockHits.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {blockHits.map((hit) => (
                            <li key={hit.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  patch(draft.key, {
                                    placeId: hit.id,
                                    placeLabel: [hit.name, hit.area]
                                      .filter(Boolean)
                                      .join(" · "),
                                  });
                                  setBlockQuery(null);
                                  setBlockHits([]);
                                }}
                                className="w-full rounded-xl border border-line bg-raise px-4 py-2 text-left text-sm transition-colors hover:border-accent/50"
                              >
                                {hit.name}
                                {hit.area && (
                                  <span className="text-ink-dim"> · {hit.area}</span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  <Input
                    value={draft.note}
                    onChange={(e) => patch(draft.key, { note: e.target.value })}
                    placeholder="Why this one? (optional)"
                    aria-label={`Note for block ${index + 1}`}
                  />
                </div>
              ) : (
                <Textarea
                  value={draft.text}
                  onChange={(e) => patch(draft.key, { text: e.target.value })}
                  placeholder={BLOCK_PLACEHOLDERS[draft.type]}
                  aria-label={`${BLOCK_LABELS[draft.type]} ${index + 1}`}
                  rows={draft.type === "paragraph" ? 5 : 2}
                />
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {ARTICLE_BLOCK_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDrafts((rows) => [...rows, newDraft(t)])}
              >
                + {BLOCK_LABELS[t]}
              </Button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="voice mb-2">Who sees it</legend>
          {[
            {
              value: false,
              label: "Only on this place's page",
              hint: "People find it when they look the place up.",
            },
            {
              value: true,
              label: "Public - in the feed too",
              hint: "Everyone sees it in their feed, like a reel.",
            },
          ].map((option) => (
            <label
              key={String(option.value)}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors",
                showInFeed === option.value
                  ? "border-accent bg-accent/10"
                  : "border-line bg-surface hover:border-accent/50",
              )}
            >
              <input
                type="radio"
                name="show_in_feed"
                className="mt-1"
                checked={showInFeed === option.value}
                onChange={() => setShowInFeed(option.value)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm">{option.label}</span>
                <span className="text-xs text-ink-dim">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}

        <p className="text-xs leading-relaxed text-ink-dim">
          Blogs are reviewed before they appear. Text usually clears straight
          away.
        </p>

        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner className="border-night/30 border-t-night" /> : null}
          Publish
        </Button>
      </form>
    </Screen>
  );
}
