"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Kunngjøringer", icon: Inbox, exact: true },
  { href: "/settings", label: "Innstillinger", icon: Settings, exact: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: ["company"],
    queryFn: () => api.getCompany(),
    staleTime: 30_000,
  });
  const company = data?.company ?? null;

  return (
    <div className="flex h-screen bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="px-5 py-6">
          <div className="font-display text-xl">Doffin Whisperer</div>
          {company?.companyName && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {company.companyName}
            </div>
          )}
        </div>
        <nav className="flex-1 px-3">
          {NAV.map((n) => {
            const active = n.exact
              ? pathname === n.href
              : pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
