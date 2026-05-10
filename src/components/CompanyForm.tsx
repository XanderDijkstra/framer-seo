"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CPV_OPTIONS } from "@/lib/cpv-codes";
import { SERVICE_OPTIONS } from "@/lib/services";
import { NORWEGIAN_REGIONS } from "@/lib/regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompanyInput } from "@/lib/api-client";

export const EMPTY_COMPANY: CompanyInput = {
  companyName: "",
  teamSize: 1,
  budgetMin: 50_000,
  budgetMax: 500_000,
  services: [],
  cpvCodes: [],
  searchKeywords: "",
  boostKeywords: [],
  penaltyKeywords: [],
  preferredRegions: [],
  cannotDeliver: [],
  strengths: [],
  pipelineSchedule: "daily",
};

export function CompanyForm({
  initial,
  submitLabel,
  onSubmit,
  showSchedule,
}: {
  initial: CompanyInput;
  submitLabel: string;
  onSubmit: (value: CompanyInput) => Promise<void> | void;
  showSchedule?: boolean;
}) {
  const [form, setForm] = useState<CompanyInput>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [cpvQuery, setCpvQuery] = useState("");

  function patch(p: Partial<CompanyInput>) {
    setForm((s) => ({ ...s, ...p }));
  }

  function toggle(field: keyof CompanyInput, value: string) {
    setForm((s) => {
      const arr = (s[field] as string[]) ?? [];
      return {
        ...s,
        [field]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      } as CompanyInput;
    });
  }

  const filteredCpv = useMemo(() => {
    const q = cpvQuery.trim().toLowerCase();
    if (!q) return CPV_OPTIONS;
    return CPV_OPTIONS.filter(
      (c) =>
        c.code.includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q),
    );
  }, [cpvQuery]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-xl">Firma</h2>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="companyName">Navn</Label>
            <Input
              id="companyName"
              value={form.companyName}
              onChange={(e) => patch({ companyName: e.target.value })}
              placeholder="Webdesign Oslo AS"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="teamSize">Ansatte</Label>
              <Input
                id="teamSize"
                type="number"
                min={1}
                value={form.teamSize}
                onChange={(e) =>
                  patch({
                    teamSize: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="budgetMin">Budsjett min</Label>
              <Input
                id="budgetMin"
                type="number"
                min={0}
                step={10000}
                value={form.budgetMin}
                onChange={(e) =>
                  patch({ budgetMin: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="budgetMax">Budsjett maks</Label>
              <Input
                id="budgetMax"
                type="number"
                min={0}
                step={10000}
                value={form.budgetMax}
                onChange={(e) =>
                  patch({ budgetMax: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          {showSchedule && (
            <div className="space-y-1">
              <Label>Pipeline-frekvens</Label>
              <div className="flex gap-2">
                {(["daily", "weekly"] as const).map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => patch({ pipelineSchedule: s })}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm",
                      form.pipelineSchedule === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-accent",
                    )}
                  >
                    {s === "daily" ? "Daglig" : "Ukentlig"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-xl">Tjenester</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((opt) => {
            const active = form.services.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle("services", opt)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-accent",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 lg:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl">CPV-koder</h2>
          <span className="text-xs text-muted-foreground">
            {form.cpvCodes.length} valgt
          </span>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={cpvQuery}
            onChange={(e) => setCpvQuery(e.target.value)}
            placeholder="Søk etter kode eller stikkord…"
            className="pl-9"
          />
        </div>
        <ul className="mt-3 max-h-[24rem] space-y-1 overflow-y-auto pr-2">
          {filteredCpv.map((c) => {
            const active = form.cpvCodes.includes(c.code);
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => toggle("cpvCodes", c.code)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <span>
                    <code className="mr-2 text-xs text-muted-foreground">
                      {c.code}
                    </code>
                    {c.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      · {c.group}
                    </span>
                  </span>
                  {active && (
                    <span className="text-xs text-primary">valgt</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-6 lg:col-span-2">
        <h2 className="text-xl">Søkeord og finstemming</h2>
        <div className="mt-3 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="kw">Fritekstsøk (skill med " OR ")</Label>
            <Textarea
              id="kw"
              value={form.searchKeywords}
              onChange={(e) => patch({ searchKeywords: e.target.value })}
              rows={3}
              placeholder="webdesign OR nettside OR digital plattform"
            />
            <p className="text-xs text-muted-foreground">
              Vi sender én forespørsel per ord — Doffin-API-et støtter ikke OR
              direkte.
            </p>
          </div>

          <TagInput
            label="Boost-ord (gir høyere score når de treffer)"
            values={form.boostKeywords}
            onAdd={(v) => toggle("boostKeywords", v)}
            onRemove={(v) => toggle("boostKeywords", v)}
          />
          <TagInput
            label="Eksklusjons-ord (treff = automatisk SKIP)"
            values={form.penaltyKeywords}
            onAdd={(v) => toggle("penaltyKeywords", v)}
            onRemove={(v) => toggle("penaltyKeywords", v)}
          />
          <TagInput
            label="Styrker"
            values={form.strengths}
            onAdd={(v) => toggle("strengths", v)}
            onRemove={(v) => toggle("strengths", v)}
          />
          <TagInput
            label="Kan ikke levere"
            values={form.cannotDeliver}
            onAdd={(v) => toggle("cannotDeliver", v)}
            onRemove={(v) => toggle("cannotDeliver", v)}
          />

          <div>
            <Label className="mb-2 block">Foretrukne regioner</Label>
            <div className="flex flex-wrap gap-2">
              {NORWEGIAN_REGIONS.map((r) => {
                const active = form.preferredRegions.includes(r);
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => toggle("preferredRegions", r)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-accent",
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Lagrer…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function TagInput({
  label,
  values,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (v && !values.includes(v)) onAdd(v);
    setDraft("");
  }
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background p-2">
        {values.map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => onRemove(v)}
            className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-destructive/15 hover:text-destructive"
          >
            {v} ×
          </button>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder="Skriv og trykk Enter"
          className="min-w-[12ch] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    </div>
  );
}
