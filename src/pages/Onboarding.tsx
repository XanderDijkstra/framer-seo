import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CPV_OPTIONS } from "@/lib/cpv-codes";
import { SERVICE_OPTIONS } from "@/lib/services";
import { NORWEGIAN_REGIONS } from "@/lib/regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type State = {
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
};

const initial: State = {
  company_name: "",
  team_size: 1,
  budget_min: 50_000,
  budget_max: 500_000,
  services: [],
  cpv_codes: [],
  search_keywords: "",
  boost_keywords: [],
  penalty_keywords: [],
  preferred_regions: [],
  cannot_deliver: [],
  strengths: [],
};

const STEPS = [
  { title: "Firma", description: "Grunnleggende info" },
  { title: "Tjenester", description: "Hva leverer dere?" },
  { title: "CPV-koder", description: "Velg relevante kategorier" },
  { title: "Søkeord", description: "Finstem treffene" },
] as const;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>(initial);
  const [submitting, setSubmitting] = useState(false);

  function patch(p: Partial<State>) {
    setState((s) => ({ ...s, ...p }));
  }

  function toggle(field: keyof State, value: string) {
    setState((s) => {
      const arr = (s[field] as string[]) ?? [];
      return {
        ...s,
        [field]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      };
    });
  }

  async function submit() {
    setSubmitting(true);
    try {
      const core_cpv_prefixes = Array.from(
        new Set(state.cpv_codes.map((c) => c.slice(0, 2)).filter(Boolean)),
      );
      const { error } = await supabase.rpc(
        "create_company_for_current_user",
        {
          p_company_name: state.company_name,
          p_services: state.services,
          p_cpv_codes: state.cpv_codes,
          p_core_cpv_prefixes: core_cpv_prefixes,
          p_search_keywords: state.search_keywords,
          p_boost_keywords: state.boost_keywords,
          p_penalty_keywords: state.penalty_keywords,
          p_preferred_regions: state.preferred_regions,
          p_cannot_deliver: state.cannot_deliver,
          p_strengths: state.strengths,
          p_budget_min: state.budget_min,
          p_budget_max: state.budget_max,
          p_team_size: state.team_size,
        },
      );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Firmaprofilen er opprettet.");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Klarte ikke å lagre");
    } finally {
      setSubmitting(false);
    }
  }

  const canAdvance =
    step === 0
      ? state.company_name.trim().length > 0
      : step === 1
        ? state.services.length > 0
        : step === 2
          ? state.cpv_codes.length > 0
          : true;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-normal">Velkommen</h1>
          <p className="mt-2 text-muted-foreground">
            Fyll ut firmaprofilen så vi kan finne anbud som passer dere.
          </p>
        </header>

        <ol className="mb-8 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                i === step
                  ? "border-primary bg-primary/5 text-primary"
                  : i < step
                    ? "border-success/40 bg-success/5 text-success"
                    : "border-border text-muted-foreground",
              )}
            >
              <div className="font-medium">
                {i + 1}. {s.title}
              </div>
              <div>{s.description}</div>
            </li>
          ))}
        </ol>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          {step === 0 && <StepBasics state={state} patch={patch} />}
          {step === 1 && (
            <StepServices state={state} toggle={(v) => toggle("services", v)} />
          )}
          {step === 2 && (
            <StepCpv state={state} toggle={(v) => toggle("cpv_codes", v)} />
          )}
          {step === 3 && (
            <StepKeywords state={state} patch={patch} toggle={toggle} />
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4" /> Tilbake
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
            >
              Neste <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting || !canAdvance}>
              {submitting ? "Lagrer…" : "Fullfør"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepBasics({
  state,
  patch,
}: {
  state: State;
  patch: (p: Partial<State>) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl">Om firmaet</h2>
      <div className="space-y-1.5">
        <Label htmlFor="company">Firmanavn</Label>
        <Input
          id="company"
          value={state.company_name}
          onChange={(e) => patch({ company_name: e.target.value })}
          placeholder="Webdesign Oslo AS"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="team">Antall ansatte</Label>
          <Input
            id="team"
            type="number"
            min={1}
            value={state.team_size}
            onChange={(e) =>
              patch({ team_size: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bmin">Budsjett min (NOK)</Label>
          <Input
            id="bmin"
            type="number"
            min={0}
            step={10000}
            value={state.budget_min}
            onChange={(e) =>
              patch({ budget_min: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bmax">Budsjett maks (NOK)</Label>
          <Input
            id="bmax"
            type="number"
            min={0}
            step={10000}
            value={state.budget_max}
            onChange={(e) =>
              patch({ budget_max: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </div>
      </div>
    </div>
  );
}

function StepServices({
  state,
  toggle,
}: {
  state: State;
  toggle: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">Tjenester</h2>
        <p className="text-sm text-muted-foreground">
          Velg alt dere tilbyr. Bruker du noe som ikke er listet, legg det
          inn under "Søkeord" senere.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SERVICE_OPTIONS.map((opt) => {
          const active = state.services.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
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
    </div>
  );
}

function StepCpv({
  state,
  toggle,
}: {
  state: State;
  toggle: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const lc = q.trim().toLowerCase();
    if (!lc) return CPV_OPTIONS;
    return CPV_OPTIONS.filter(
      (c) =>
        c.code.includes(lc) ||
        c.label.toLowerCase().includes(lc) ||
        c.group.toLowerCase().includes(lc),
    );
  }, [q]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof CPV_OPTIONS>();
    for (const c of filtered) {
      if (!m.has(c.group)) m.set(c.group, []);
      m.get(c.group)!.push(c);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">CPV-koder</h2>
        <p className="text-sm text-muted-foreground">
          CPV er det offentliges anbudskategoriserings­system. Velg det som
          treffer deres tjenester. ({state.cpv_codes.length} valgt)
        </p>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søk etter kode eller stikkord…"
          className="pl-9"
        />
      </div>
      <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-2">
        {grouped.map(([group, items]) => (
          <div key={group}>
            <h3 className="mb-2 font-display text-sm uppercase tracking-wide text-muted-foreground">
              {group}
            </h3>
            <ul className="space-y-1">
              {items.map((c) => {
                const active = state.cpv_codes.includes(c.code);
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => toggle(c.code)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
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
                      </span>
                      {active && <Badge variant="default">valgt</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepKeywords({
  state,
  patch,
  toggle,
}: {
  state: State;
  patch: (p: Partial<State>) => void;
  toggle: (field: keyof State, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl">Søkeord og finstemming</h2>
      <div className="space-y-1.5">
        <Label htmlFor="kw">
          Fritekstsøk (skill alternative ord med " OR ")
        </Label>
        <Textarea
          id="kw"
          rows={3}
          value={state.search_keywords}
          onChange={(e) => patch({ search_keywords: e.target.value })}
          placeholder="webdesign OR nettside OR digital plattform"
        />
        <p className="text-xs text-muted-foreground">
          Vi sender én forespørsel per ord — Doffin-API-et støtter ikke
          OR direkte.
        </p>
      </div>

      <TagInput
        label="Boost-ord (gir høyere score når de treffer)"
        values={state.boost_keywords}
        onAdd={(v) => toggle("boost_keywords", v)}
        onRemove={(v) => toggle("boost_keywords", v)}
        placeholder="Legg til, trykk Enter"
      />

      <TagInput
        label="Eksklusjons-ord (treff = automatisk SKIP)"
        values={state.penalty_keywords}
        onAdd={(v) => toggle("penalty_keywords", v)}
        onRemove={(v) => toggle("penalty_keywords", v)}
        placeholder="renhold, vakthold, …"
      />

      <TagInput
        label="Styrker (brukes i scoring)"
        values={state.strengths}
        onAdd={(v) => toggle("strengths", v)}
        onRemove={(v) => toggle("strengths", v)}
        placeholder="rask levering, moderne stack…"
      />

      <TagInput
        label="Kan ikke levere"
        values={state.cannot_deliver}
        onAdd={(v) => toggle("cannot_deliver", v)}
        onRemove={(v) => toggle("cannot_deliver", v)}
        placeholder="store IT-installasjoner…"
      />

      <div>
        <Label className="mb-2 block">Foretrukne regioner</Label>
        <div className="flex flex-wrap gap-2">
          {NORWEGIAN_REGIONS.map((r) => {
            const active = state.preferred_regions.includes(r);
            return (
              <button
                type="button"
                key={r}
                onClick={() => toggle("preferred_regions", r)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
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
  );
}

function TagInput({
  label,
  values,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (v && !values.includes(v)) onAdd(v);
    setDraft("");
  }
  return (
    <div className="space-y-1.5">
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
          placeholder={placeholder}
          className="min-w-[12ch] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    </div>
  );
}
