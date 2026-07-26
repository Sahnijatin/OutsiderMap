import { describe, expect, it } from "vitest";
import {
  chunk,
  embedRowsInBatches,
  type EmbeddableRow,
} from "@/lib/admin/embed-sweep";

/**
 * The embed sweep exists because publishing without an embedding creates a
 * place invisible to chat/search (match_places filters `embedding is not
 * null`). These tests pin the batching and failure-collection contract: a
 * failed embeddings call fails only its batch, a failed save fails only its
 * row, and later batches still run either way.
 */

function row(id: string): EmbeddableRow {
  return {
    id,
    name: `Place ${id}`,
    category: "cafe",
    area: "Hauz Khas",
    vibe_tags: ["quiet"],
    description: null,
    editor_note: null,
    best_for: null,
    price_level: null,
  };
}

const vec = (n: number) => Array.from({ length: 3 }, () => n);

describe("chunk", () => {
  it("splits rows into batches of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single batch when rows fit", () => {
    expect(chunk([1, 2], 32)).toEqual([[1, 2]]);
  });

  it("handles an empty list", () => {
    expect(chunk([], 32)).toEqual([]);
  });

  it("rejects a non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("embedRowsInBatches", () => {
  it("embeds every row across multiple batches", async () => {
    const rows = ["a", "b", "c", "d", "e"].map(row);
    const calls: number[] = [];
    const saved: string[] = [];

    const result = await embedRowsInBatches(rows, {
      batchSize: 2,
      embedTexts: async (texts) => {
        calls.push(texts.length);
        return texts.map((_, i) => vec(i));
      },
      save: async (id) => {
        saved.push(id);
      },
    });

    expect(result).toEqual({ embedded: 5, failed: 0, failures: [] });
    expect(calls).toEqual([2, 2, 1]);
    expect(saved).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("fails a whole batch when the embeddings call throws, and keeps going", async () => {
    const rows = ["a", "b", "c", "d"].map(row);
    let call = 0;

    const result = await embedRowsInBatches(rows, {
      batchSize: 2,
      embedTexts: async (texts) => {
        call += 1;
        if (call === 1) throw new Error("rate limited");
        return texts.map(() => vec(1));
      },
      save: async () => {},
    });

    expect(result.embedded).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.failures).toEqual([
      { id: "a", error: "rate limited" },
      { id: "b", error: "rate limited" },
    ]);
  });

  it("fails only the row whose save throws", async () => {
    const rows = ["a", "b", "c"].map(row);

    const result = await embedRowsInBatches(rows, {
      batchSize: 32,
      embedTexts: async (texts) => texts.map(() => vec(1)),
      save: async (id) => {
        if (id === "b") throw new Error("db down");
      },
    });

    expect(result.embedded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([{ id: "b", error: "db down" }]);
  });

  it("fails the batch when the provider returns the wrong number of vectors", async () => {
    const rows = ["a", "b"].map(row);

    const result = await embedRowsInBatches(rows, {
      batchSize: 32,
      embedTexts: async () => [vec(1)],
      save: async () => {},
    });

    expect(result.embedded).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.failures[0].error).toContain("expected 2 embeddings");
  });

  it("does nothing with no rows", async () => {
    const result = await embedRowsInBatches([], {
      embedTexts: async () => {
        throw new Error("should not be called");
      },
      save: async () => {
        throw new Error("should not be called");
      },
    });
    expect(result).toEqual({ embedded: 0, failed: 0, failures: [] });
  });
});
