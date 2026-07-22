"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: { username: string | null; display_name: string | null } | null;
  mine: boolean;
};

function label(author: Comment["author"]): string {
  if (author?.username) return `@${author.username}`;
  if (author?.display_name) return author.display_name;
  return "An outsider";
}

/** Comments on the post detail: load, add, and delete your own. */
export function Comments({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { comments: Comment[] };
        setComments(body.comments);
      } catch {
        setError("Couldn't load comments.");
      } finally {
        setLoading(false);
      }
    })();
  }, [postId]);

  async function add() {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error();
      const { comment } = (await res.json()) as {
        comment: { id: string; body: string; created_at: string };
      };
      setComments((cur) => [
        ...cur,
        { ...comment, author: null, mine: true },
      ]);
      setDraft("");
    } catch {
      setError("Couldn't post that comment.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    const prev = comments;
    setComments((cur) => cur.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setComments(prev);
    }
  }

  return (
    <section className="mt-2 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          maxLength={4000}
          rows={2}
        />
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={add} disabled={posting || !draft.trim()}>
            {posting && <Spinner />}
            Comment
          </Button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-dim">
          No comments yet. Say the first thing.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm text-ink">{label(c.author)}</span>
                <p className="whitespace-pre-wrap break-words text-sm text-ink-dim">
                  {c.body}
                </p>
              </div>
              {c.mine && (
                <button
                  onClick={() => remove(c.id)}
                  aria-label="Delete comment"
                  className="shrink-0 text-ink-dim hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
