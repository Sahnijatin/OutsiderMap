import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The plain-language terms for using OutsiderMap: your content, acceptable use, points, and the limits of what we promise.",
};

/**
 * Terms of use - short and plain by design. Marked as a draft until counsel
 * signs off; the draft banner must be resolved before launch.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-ink-dim">
        <span className="font-semibold text-ink">Draft.</span> These terms are
        pending review by counsel and may change before they are final.
      </p>

      <h1 className="mt-8 font-display text-3xl italic">Terms of use</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-dim">
        These are the rules for using OutsiderMap. They are deliberately short
        and in plain language. By creating an account or using the app, you
        agree to them.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Your content</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          What you post stays yours. By posting it here (photos, posts, place
          submissions, reviews), you give us a worldwide, royalty-free licence
          to host it, display it, and adapt it technically (resizing,
          thumbnails) so the product works. That licence ends for content you
          delete, except where it has already been shared with others or we
          must retain it by law. Only post what you have the right to post.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Acceptable use</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Be real and do no harm. Do not post content that is illegal,
          harassing, hateful, or sexually exploitative. Do not impersonate
          people, spam, scrape the service, game the points system, submit
          places you have not actually verified, or interfere with the
          service or other members. We may remove content and suspend or
          close accounts that break these rules.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Listings and accuracy</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          The map is built from open data, editorial work, and member
          submissions. Places close, timings change, and recommendations are
          opinions, not guarantees. We work hard to keep it honest, but we do
          not warrant that any listing is accurate, current, or suitable for
          you, and you use it at your own judgment.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Points</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Scout points are a reputation and reward mechanic inside the app.
          They have no cash value, are not a currency or deposit, and cannot
          be sold or transferred, unless and until we explicitly state
          otherwise in writing. We may adjust point balances that were earned
          by gaming the system.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">The service</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          We provide OutsiderMap as it is, and we keep improving it, which
          means features can change or be withdrawn. To the extent the law
          allows, our liability to you is limited to the amount you paid us in
          the past twelve months, which for most members is nothing. Nothing
          in these terms limits liability that cannot lawfully be limited.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Governing law</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          These terms are governed by the laws of India, and the courts of
          India have jurisdiction over any dispute. How we handle your data is
          covered by our{" "}
          <Link
            href="/privacy"
            className="text-ink underline hover:text-accent"
          >
            privacy policy
          </Link>
          , which is part of these terms.
        </p>
      </section>
    </main>
  );
}
