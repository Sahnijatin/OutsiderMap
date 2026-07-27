import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminTabs } from "./tabs";

// No admin page is ever statically prerendered: every one of them reads live
// data with the service role (and the auth gate below needs the request's
// cookies). Without this, `next build` on a clean env tried to prerender e.g.
// /admin/diagnostics and died on the missing Supabase vars (§1.6).
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface/50 pt-[var(--safe-top)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <Link href="/map" className="font-display text-lg italic">
              OutsiderMap
            </Link>
            <span className="voice">curation desk</span>
          </div>
          <AdminTabs />
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
