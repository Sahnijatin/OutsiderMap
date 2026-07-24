import { describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");

const { toItem, displayHandle } = await import("@/lib/media/place-media");

const base = {
  id: "m1",
  kind: "image",
  licence_basis: "user_upload",
  storage_path: "delhi/karims.jpg",
  source_url: null,
  source_platform: null,
  author_name: null,
  author_url: null,
  embed_html: null,
  thumbnail_url: null,
  caption: null,
  captured_at: null,
};

describe("toItem", () => {
  it("renders a hosted photo from our bucket", () => {
    const item = toItem(base);
    expect(item).toMatchObject({
      variant: "hosted",
      kind: "image",
      src: "https://example.supabase.co/storage/v1/object/public/place-images/delhi/karims.jpg",
    });
  });

  it("drops a hosted row with no file rather than rendering a broken image", () => {
    expect(toItem({ ...base, storage_path: null })).toBeNull();
  });

  it("treats video as video", () => {
    expect(toItem({ ...base, kind: "video" })?.kind).toBe("video");
  });

  const reel = {
    ...base,
    id: "m2",
    kind: "embed",
    licence_basis: "embed",
    storage_path: null,
    source_url: "https://www.instagram.com/reel/abc123/",
    source_platform: "instagram",
    author_name: "delhifoodwalks",
    author_url: "https://www.instagram.com/delhifoodwalks/",
    embed_html: "<blockquote>...</blockquote>",
  };

  it("keeps the creator's link and handle on an embed", () => {
    // Attribution is the whole basis for showing this, so it has to survive
    // the mapping intact.
    expect(toItem(reel)).toMatchObject({
      variant: "embed",
      platform: "instagram",
      sourceUrl: "https://www.instagram.com/reel/abc123/",
      authorName: "delhifoodwalks",
      authorUrl: "https://www.instagram.com/delhifoodwalks/",
    });
  });

  it("refuses to show an embed that lost its attribution", () => {
    expect(toItem({ ...reel, author_name: null })).toBeNull();
    expect(toItem({ ...reel, source_url: null })).toBeNull();
  });

  it("never builds a hosted src for an embed row", () => {
    // An embed must stay a pointer. If this ever returned a bucket URL it
    // would mean we had copied someone's reel into our storage.
    const item = toItem(reel);
    expect(item?.variant).toBe("embed");
    expect(JSON.stringify(item)).not.toContain("storage/v1/object");
  });

  it("falls back to 'other' for an unknown platform", () => {
    const item = toItem({ ...reel, source_platform: "vimeo" });
    expect(item).toMatchObject({ variant: "embed", platform: "other" });
  });
});

describe("displayHandle", () => {
  it("adds the @ when the platform omitted it", () => {
    expect(displayHandle("delhifoodwalks")).toBe("@delhifoodwalks");
  });

  it("does not double up an existing @", () => {
    expect(displayHandle("@delhifoodwalks")).toBe("@delhifoodwalks");
  });

  it("survives empty input", () => {
    expect(displayHandle("  ")).toBe("");
  });
});
