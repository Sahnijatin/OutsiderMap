import "server-only";

/**
 * Deterministic cleanup of the model's reply before it is persisted or sent.
 *
 * The voice rules already forbid markdown, em dashes, and list formatting -
 * but rules in a long prompt are enforcement-by-hope, and the chat renders
 * plain text, so one disobedient reply shows literal `**` to the user. This
 * strips what the UI cannot render and normalizes the house dash style;
 * anything subtler (tone, banned vocabulary) stays the prompt's job.
 */
export function sanitizeReply(text: string): string {
  let out = text;

  // Emphasis markers: **bold**, __bold__, *italic*, _italic_ - keep the text.
  out = out.replace(/(\*\*|__)(.+?)\1/g, "$2");
  out = out.replace(/(^|\s)\*([^*\n]+)\*(?=[\s.,!?;:]|$)/g, "$1$2");
  // Inline code and heading prefixes.
  out = out.replace(/`+([^`]*)`+/g, "$1");
  out = out.replace(/^#{1,6}\s+/gm, "");
  // Bullet-list markers at line starts ("- ", "* ", "• ") - prose stays.
  out = out.replace(/^\s*[-*•]\s+/gm, "");
  // House dash style: em/en dashes become plain hyphens with breathing room.
  out = out.replace(/\s*[–—]\s*/g, " - ");
  // Collapse the blank-line stacks list-stripping can leave behind.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}
