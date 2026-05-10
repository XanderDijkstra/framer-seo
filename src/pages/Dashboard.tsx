import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, RefreshCw, Play, Loader2 } from "lucide-react";
import {
  fetchNoticesWithScores,
  invokeFunction,
  rescoreAllForMyCompany,
  toggleFavorite,
  type NoticeWithScore,
} from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { ScoreBadge, ActionBadge } from "@/components/ScoreBadge";
import { Button } from "@/components/ui/button";
import { cn, daysUntil, formatDateNo } from "@/lib/utils";

type Tab = "ALL" | "BID" | "REVIEW" | "SKIP";

export default function DashboardPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("BID");
  const [category, setCategory] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["notices"],
    queryFn: fetchNoticesWithScores,
    refetchInterval: 60_000,
  });

  const notices = data?.notices ?? [];

  const counts = useMemo(() => {
    const c = { ALL: notices.length, BID: 0, REVIEW: 0, SKIP: 0 };
    for (const n of notices) {
      const a = n.score?.recommended_action;
      if (a === "BID") c.BID++;
      else if (a === "REVIEW") c.REVIEW++;
      else if (a === "SKIP") c.SKIP++;
    }
    return c;
  }, [notices]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const n of notices) if (n.score?.category) set.add(n.score.category);
    return [...set].sort();
  }, [notices]);

  const filtered = useMemo(() => {
    return notices.filter((n) => {
      if (favOnly && !n.is_favorite) return false;
      if (tab !== "ALL") {
        if (n.score?.recommended_action !== tab) return false;
      }
      if (category && n.score?.category !== category) return false;
      return true;
    });
  }, [notices, tab, category, favOnly]);

  const runPipeline = useMutation({
    mutationFn: () => invokeFunction("run-pipeline"),
    onSuccess: (res) => {
      toast.success("Pipeline kjørt", {
        description: JSON.stringify(res, null, 2).slice(0, 200),
      });
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rescore = useMutation({
    mutationFn: async () => {
      await rescoreAllForMyCompany();
      return invokeFunction("score-notices");
    },
    onSuccess: () => {
      toast.success("Ny scoring startet");
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <AppShell>
      <div className="px-4 py-6 md:px-8 md:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl">Kunngjøringer</h1>
            <p className="text-sm text-muted-foreground">
              {data?.notices.length ?? 0} totalt
              {isFetching && !isLoading ? " · oppdaterer…" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => rescore.mutate()}
              disabled={rescore.isPending}
            >
              {rescore.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-score alle
            </Button>
            <Button
              size="sm"
              onClick={() => runPipeline.mutate()}
              disabled={runPipeline.isPending}
            >
              {runPipeline.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Kjør pipeline
            </Button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["ALL", "BID", "REVIEW", "SKIP"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                tab === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-accent",
              )}
            >
              {t === "ALL"
                ? "Alle"
                : t === "BID"
                  ? "BUD"
                  : t === "REVIEW"
                    ? "VURDER"
                    : "HOPP OVER"}
              <span className="ml-1.5 opacity-70">{counts[t]}</span>
            </button>
          ))}
          <button
            onClick={() => setFavOnly((f) => !f)}
            className={cn(
              "ml-auto rounded-full border px-3 py-1.5 text-sm transition-colors",
              favOnly
                ? "border-warning bg-warning/10 text-foreground"
                : "border-border bg-background hover:bg-accent",
            )}
          >
            <Star
              className={cn(
                "mr-1 inline h-3.5 w-3.5",
                favOnly && "fill-warning text-warning",
              )}
            />
            Favoritter
          </button>
        </div>

        {categories.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
            <button
              onClick={() => setCategory(null)}
              className={cn(
                "rounded-full border px-2.5 py-1 transition-colors",
                !category
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-accent",
              )}
            >
              Alle kategorier
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 transition-colors",
                  category === c
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:bg-accent",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            Laster…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasAny={notices.length > 0} />
        ) : (
          <ul className="space-y-2">
            {filtered.map((n) => (
              <NoticeRow key={n.id} notice={n} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function NoticeRow({ notice }: { notice: NoticeWithScore }) {
  const qc = useQueryClient();
  const fav = useMutation({
    mutationFn: (next: boolean) => toggleFavorite(notice.id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
  const days = daysUntil(notice.deadline);
  return (
    <li>
      <Link
        to={`/notice/${notice.id}`}
        className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:shadow-sm"
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              fav.mutate(!notice.is_favorite);
            }}
            className="mt-0.5 text-muted-foreground hover:text-warning"
            aria-label={notice.is_favorite ? "Fjern favoritt" : "Favoritt"}
          >
            <Star
              className={cn(
                "h-4 w-4",
                notice.is_favorite && "fill-warning text-warning",
              )}
            />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge action={notice.score?.recommended_action} />
              {notice.score?.category && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {notice.score.category}
                </span>
              )}
              <h2 className="truncate text-base font-medium leading-snug">
                {notice.title}
              </h2>
            </div>
            <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {notice.score?.summary_no ??
                notice.description?.slice(0, 200) ??
                "Ingen beskrivelse."}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {notice.buyer && <span>{notice.buyer}</span>}
              {notice.deadline && (
                <span>
                  Frist {formatDateNo(notice.deadline)}
                  {typeof days === "number" && days >= 0 && (
                    <span className="ml-1 opacity-60">({days}d)</span>
                  )}
                </span>
              )}
              {notice.buyer_location && <span>{notice.buyer_location}</span>}
            </div>
          </div>
          <ScoreBadge value={notice.score?.composite ?? null} />
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-12 text-center">
      <h2 className="font-display text-2xl">Ingen treff her</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {hasAny
          ? "Prøv en annen fane eller kategori."
          : 'Ingen kunngjøringer er hentet ennå. Trykk "Kjør pipeline" for å hente og score nye anbud.'}
      </p>
    </div>
  );
}
