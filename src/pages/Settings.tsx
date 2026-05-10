import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { fetchMyCompany } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { CPV_OPTIONS } from "@/lib/cpv-codes";
import { SERVICE_OPTIONS } from "@/lib/services";
import { NORWEGIAN_REGIONS } from "@/lib/regions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Form = {
  company_name: string;
  team_size: number;
  budget_min: number;
  budget_max: number;
  services: string[];
  cpv_codes: string[];
  search_keywords: string;
  boost_keywords: string[];
  penalty_keywords: string[];
  preferred_regions: string[];
  cannot_deliver: string[];
  strengths: string[];
  pipeline_schedule: "daily" | "weekly";
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: company } = useQuery({
    queryKey: ["company"],
    queryFn: fetchMyCompany,
  });

  const [form, setForm] = useState<Form | null>(null);
  const [cpvQuery, setCpvQuery] = useState("");

  useEffect(() => {
    if (company && !form) {
      setForm({
        company_name: company.company_name,
        team_size: company.team_size,
        budget_min: company.budget_min,
        budget_max: company.budget_max,
        services: company.services,
        cpv_codes: company.cpv_codes,
        search_keywords: company.search_keywords,
        boost_keywords: company.boost_keywords,
        penalty_keywords: company.penalty_keywords,
        preferred_regions: company.preferred_regions,
        cannot_deliver: company.cannot_deliver,
        strengths: company.strengths,
        pipeline_schedule: company.pipeline_schedule,
      });
    }
  }, [company, form]);

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

  const save = useMutation({
    mutationFn: async (next: Form) => {
      if (!company) throw new Error("No company loaded");
      const core_cpv_prefixes = Array.from(
        new Set(next.cpv_codes.map((c) => c.slice(0, 2)).filter(Boolean)),
      );
      const { error } = await supabase
        .from("company_profile")
        .update({
          ...next,
          core_cpv_prefixes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lagret");
      qc.invalidateQueries({ queryKey: ["company"] });
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!form) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Laster…</div>
      </AppShell>
    );
  }

  function patch(p: Partial<Form>) {
    setForm((s) => (s ? { ...s, ...p } : s));
  }

  function toggle(field: keyof Form, value: string) {
    setForm((s) => {
      if (!s) return s;
      const arr = (s[field] as string[]) ?? [];
      return {
        ...s,
        [field]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      };
    });
  }

  return (
    <AppShell>
      <div className="px-4 py-6 md:px-8 md:py-8">
        <header className="mb-6">
          <h1 className="text-3xl">Innstillinger</h1>
          <p className="text-sm text-muted-foreground">
            Endringer påvirker fremtidige kunngjøringer. Bruk "Re-score alle" på
            innboksen for å bruke endringene tilbake i tid.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-6">
            <h2 className="text-xl">Firma</h2>
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="company_name">Navn</Label>
                <Input
                  id="company_name"
                  value={form.company_name}
                  onChange={(e) => patch({ company_name: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="team">Ansatte</Label>
                  <Input
                    id="team"
                    type="number"
                    min={1}
                    value={form.team_size}
                    onChange={(e) =>
                      patch({
                        team_size: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bmin">Budsjett min</Label>
                  <Input
                    id="bmin"
                    type="number"
                    min={0}
                    step={10000}
                    value={form.budget_min}
                    onChange={(e) =>
                      patch({ budget_min: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bmax">Budsjett maks</Label>
                  <Input
                    id="bmax"
                    type="number"
                    min={0}
                    step={10000}
                    value={form.budget_max}
                    onChange={(e) =>
                      patch({ budget_max: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Pipeline-frekvens</Label>
                <div className="flex gap-2">
                  {(["daily", "weekly"] as const).map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => patch({ pipeline_schedule: s })}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        form.pipeline_schedule === s
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-accent",
                      )}
                    >
                      {s === "daily" ? "Daglig" : "Ukentlig"}
                    </button>
                  ))}
                </div>
              </div>
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
                {form.cpv_codes.length} valgt
              </span>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={cpvQuery}
                onChange={(e) => setCpvQuery(e.target.value)}
                placeholder="Søk…"
                className="pl-9"
              />
            </div>
            <ul className="mt-3 max-h-[24rem] space-y-1 overflow-y-auto pr-2">
              {filteredCpv.map((c) => {
                const active = form.cpv_codes.includes(c.code);
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => toggle("cpv_codes", c.code)}
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
                  value={form.search_keywords}
                  onChange={(e) => patch({ search_keywords: e.target.value })}
                  rows={3}
                />
              </div>
              <TagInput
                label="Boost-ord"
                values={form.boost_keywords}
                onAdd={(v) => toggle("boost_keywords", v)}
                onRemove={(v) => toggle("boost_keywords", v)}
              />
              <TagInput
                label="Eksklusjons-ord (treff = SKIP)"
                values={form.penalty_keywords}
                onAdd={(v) => toggle("penalty_keywords", v)}
                onRemove={(v) => toggle("penalty_keywords", v)}
              />
              <TagInput
                label="Styrker"
                values={form.strengths}
                onAdd={(v) => toggle("strengths", v)}
                onRemove={(v) => toggle("strengths", v)}
              />
              <TagInput
                label="Kan ikke levere"
                values={form.cannot_deliver}
                onAdd={(v) => toggle("cannot_deliver", v)}
                onRemove={(v) => toggle("cannot_deliver", v)}
              />
              <div>
                <Label>Foretrukne regioner</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {NORWEGIAN_REGIONS.map((r) => {
                    const active = form.preferred_regions.includes(r);
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => toggle("preferred_regions", r)}
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
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending ? "Lagrer…" : "Lagre endringer"}
          </Button>
        </div>
      </div>
    </AppShell>
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
