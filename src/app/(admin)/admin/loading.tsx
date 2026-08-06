/**
 * Instant feedback for every admin tab.
 *
 * The desk pages all read live data with the service role, so a click used to
 * leave the previous tab on screen while the next one finished rendering -
 * seconds of nothing on the busier pages. This file wraps the whole /admin
 * segment in a Suspense boundary, so the tab switch is acknowledged the moment
 * it is clicked and the real content streams in behind it.
 */
export default function AdminLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy>
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 rounded-card bg-surface/60" />
      <div className="h-4 w-80 rounded-card bg-surface/40" />
      <div className="h-32 rounded-card border border-line bg-surface/30" />
      <div className="h-32 rounded-card border border-line bg-surface/30" />
    </div>
  );
}
