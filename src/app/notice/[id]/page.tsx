"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { AppShell } from "@/components/AppShell";
import { ScoreBadge, ActionBadge } from "@/components/ScoreBadge";
import { daysUntil, formatDateNo, formatNok } from "@/lib/utils";

const DIMENSIONS: Array<{
  key:
    | "relevance"
    | "sizeFit"
    | "winProbability"
    | "geographyFit"
    | "deadlineComfort";
  label: string;
}> = [
  { key: "relevance", label: "Relevans" },
  { key: "sizeFit", label: "Størrelse" },
  { key: "winProbability", label: "Vinnsannsynlighet" },
  { key: "geographyFit", label: "Geografi" },
  { key: "deadlineComfort", label: "Frist-buffer" },
];

export default function NoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ["notice", id],
    queryFn: () => api.getNotice(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Laster…</div>
      </AppShell>
    );
  }

  if (!data?.notice) {
    return (
      <AppShell>
        <div className="p-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Tilbake
          </Link>
          <p className="mt-4">Fant ikke kunngjøring.</p>
        </div>
      </AppShell>
    );
  }

  const { notice } = data;
  const score = notice.score;
  const days = daysUntil(notice.deadline);

  return (
    <AppShell>
      <div className="px-4 py-6 md:px-8 md:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Tilbake til innboks
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge action={score?.recommendedAction} />
              {score?.category && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {score.category}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-3xl">{notice.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {notice.buyer && <span>{notice.buyer}</span>}
              {notice.buyerLocation && <span>{notice.buyerLocation}</span>}
              {notice.deadline && (
                <span>
                  Frist {formatDateNo(notice.deadline)}
                  {typeof days === "number" && days >= 0 && (
                    <span className="ml-1 opacity-60">({days}d)</span>
                  )}
                </span>
              )}
              <span>{formatNok(notice.estimatedValue)}</span>
            </div>
          </div>
          {notice.url && (
            <a
              href={notice.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-accent"
            >
              Åpne på Doffin <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="rounded-lg border bg-card p-6">
              <h2 className="text-xl">Beskrivelse</h2>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {notice.description ?? "Ingen beskrivelse fra Doffin."}
              </div>
              {notice.cpvCodes && notice.cpvCodes.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {notice.cpvCodes.map((c) => (
                    <code
                      key={c}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {c}
                    </code>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl">Score</h2>
                <ScoreBadge value={score?.composite ?? null} />
              </div>
              {score?.summaryNo && (
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">
                  {score.summaryNo}
                </p>
              )}
              <div className="mt-4 space-y-2.5">
                {DIMENSIONS.map((d) => (
                  <DimBar
                    key={d.key}
                    label={d.label}
                    value={score?.[d.key] ?? null}
                  />
                ))}
              </div>
            </div>

            {score?.reasonsToBid && score.reasonsToBid.length > 0 && (
              <div className="rounded-lg border bg-card p-6">
                <h3 className="font-display text-lg">Grunner til å levere</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {score.reasonsToBid.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {score?.redFlags && score.redFlags.length > 0 && (
              <div className="rounded-lg border bg-card p-6">
                <h3 className="font-display text-lg">Røde flagg</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {score.redFlags.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function DimBar({ label, value }: { label: string; value: number | null }) {
  const v = typeof value === "number" ? value : 0;
  const pct = Math.max(0, Math.min(100, (v / 10) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {value == null ? "—" : value.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
