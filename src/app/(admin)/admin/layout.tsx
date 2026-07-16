import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface/50">
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
