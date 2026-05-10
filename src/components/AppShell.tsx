import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Settings, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { fetchMyCompany } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Kunngjøringer", icon: Inbox },
  { to: "/settings", label: "Innstillinger", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { data: company } = useQuery({
    queryKey: ["company"],
    queryFn: fetchMyCompany,
    staleTime: 30_000,
  });

  return (
    <div className="flex h-screen bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="px-5 py-6">
          <div className="font-display text-xl">Doffin Whisperer</div>
          {company?.company_name && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {company.company_name}
            </div>
          )}
        </div>
        <nav className="flex-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                cn(
                  "mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={async () => {
              await signOut();
              navigate("/auth");
            }}
          >
            <LogOut className="h-4 w-4" /> Logg ut
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
