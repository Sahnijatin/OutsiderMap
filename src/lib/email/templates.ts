import "server-only";

/*
 * Brand-faithful HTML emails. Email clients don't support external CSS or CSS
 * variables, so the OutsiderMap design tokens (globals.css @theme) are mirrored
 * here as inline hex and the display serif falls back to Georgia (Fraunces
 * isn't web-safe in mail). Layout is table-based for client compatibility.
 */

const C = {
  night: "#0c0a08",
  surface: "#16120e",
  line: "#2b241c",
  ink: "#ede7db",
  inkDim: "#9b9183",
  accent: "#f0a431",
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

function eyebrow(text: string) {
  return `<div style="font-family:${MONO};font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${C.accent};">${escapeHtml(
    text,
  )}</div>`;
}

function heading(text: string) {
  return `<div style="font-family:${SERIF};font-size:30px;line-height:1.12;color:${C.ink};margin:12px 0 0;">${text}</div>`;
}

function paragraph(html: string) {
  return `<p style="font-family:${SANS};font-size:15px;line-height:1.65;color:${C.inkDim};margin:16px 0 0;">${html}</p>`;
}

function button(label: string, href: string) {
  return `<a href="${escapeHtml(
    href,
  )}" style="display:inline-block;background:${C.accent};color:${C.night};font-family:${SANS};font-weight:600;font-size:14px;text-decoration:none;padding:13px 26px;border-radius:999px;">${escapeHtml(
    label,
  )}</a>`;
}

function shell(inner: string, preheader: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
</head>
<body style="margin:0;padding:0;background:${C.night};color:${C.ink};font-family:${SANS};">
<span style="display:none !important;visibility:hidden;opacity:0;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(
    preheader,
  )}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.surface};border:1px solid ${C.line};border-radius:20px;">
<tr><td style="padding:36px 40px 4px;">
<div style="font-family:${SERIF};font-style:italic;font-size:20px;color:${C.ink};">OutsiderMap</div>
</td></tr>
${inner}
<tr><td style="padding:24px 40px 36px;border-top:1px solid ${C.line};">
<div style="font-family:${MONO};font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:${C.inkDim};">For every city · Delhi first</div>
<div style="font-family:${SANS};font-size:12px;color:${C.inkDim};opacity:0.7;margin-top:8px;">You're getting this because you applied to the OutsiderMap waitlist.</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Sent to the applicant on a successful waitlist signup. */
export function applicantWelcomeEmail(args: {
  firstName: string;
  referralCode: string;
  shareUrl: string;
}) {
  const name = escapeHtml(args.firstName);
  const code = escapeHtml(args.referralCode);
  const inner = `
<tr><td style="padding:8px 40px 36px;">
${eyebrow("Application in")}
${heading(`You&rsquo;re on the list, ${name}.`)}
${paragraph(
  "We&rsquo;re going through every application by hand. The first 100 outsiders get early access to every spot, every drop, and every area before anyone else sees it.",
)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:${C.night};border:1px solid ${C.line};border-radius:14px;">
<tr><td style="padding:20px 24px;">
<div style="font-family:${MONO};font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${C.inkDim};">Your referral code</div>
<div style="font-family:${MONO};font-size:24px;letter-spacing:0.22em;color:${C.accent};margin-top:8px;">${code}</div>
<div style="font-family:${SANS};font-size:14px;color:${C.inkDim};margin-top:10px;">Share it - every friend who applies with your code moves you up the list.</div>
<div style="margin-top:18px;">${button("Share your code", args.shareUrl)}</div>
</td></tr>
</table>
${paragraph(
  `Follow <a href="https://instagram.com/outsidermap" style="color:${C.accent};text-decoration:none;">@outsidermap</a> - hidden spots dropping every day until we open.`,
)}
</td></tr>`;
  return {
    subject: "You're on the OutsiderMap list",
    html: shell(inner, "You're on the list - here's your referral code."),
  };
}

/** Sent to RESEND_ADMIN_EMAIL whenever a new application lands. */
export function adminApplicationEmail(args: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  instagram: string | null;
  referredBy: string | null;
  spotUrl: string | null;
  waitlistUrl: string;
}) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:7px 0;font-family:${SANS};font-size:13px;color:${C.inkDim};width:120px;vertical-align:top;">${escapeHtml(
      label,
    )}</td><td style="padding:7px 0;font-family:${SANS};font-size:14px;color:${C.ink};">${value}</td></tr>`;

  const inner = `
<tr><td style="padding:8px 40px 36px;">
${eyebrow("New application")}
${heading(`${escapeHtml(args.firstName)} ${escapeHtml(args.lastName)} applied.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
${row(
  "Email",
  `<a href="mailto:${escapeHtml(args.email)}" style="color:${C.accent};text-decoration:none;">${escapeHtml(args.email)}</a>`,
)}
${row("Phone", escapeHtml(args.phone))}
${row("City", escapeHtml(args.city))}
${args.instagram ? row("Instagram", `@${escapeHtml(args.instagram)}`) : ""}
${args.referredBy ? row("Referred by", escapeHtml(args.referredBy)) : ""}
${row("Dropped a spot", args.spotUrl ? "Yes - review below" : "No")}
</table>
<div style="margin-top:24px;">${button(
    args.spotUrl ? "Review the spot" : "Open the waitlist",
    args.spotUrl ?? args.waitlistUrl,
  )}</div>
</td></tr>`;
  return {
    subject: `New waitlist application - ${args.firstName} ${args.lastName}`,
    html: shell(inner, `${args.firstName} from ${args.city} just applied.`),
  };
}
