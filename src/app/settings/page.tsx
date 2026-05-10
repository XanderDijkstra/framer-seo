"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { AppShell } from "@/components/AppShell";
import { CompanyForm, EMPTY_COMPANY } from "@/components/CompanyForm";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["company"],
    queryFn: () => api.getCompany(),
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Laster…</div>
      </AppShell>
    );
  }

  const company = data?.company;
  const initial = company
    ? {
        companyName: company.companyName,
        teamSize: company.teamSize,
        budgetMin: company.budgetMin,
        budgetMax: company.budgetMax,
        services: company.services,
        cpvCodes: company.cpvCodes,
        searchKeywords: company.searchKeywords,
        boostKeywords: company.boostKeywords,
        penaltyKeywords: company.penaltyKeywords,
        preferredRegions: company.preferredRegions,
        cannotDeliver: company.cannotDeliver,
        strengths: company.strengths,
        pipelineSchedule: company.pipelineSchedule,
      }
    : EMPTY_COMPANY;

  return (
    <AppShell>
      <div className="px-4 py-6 md:px-8 md:py-8">
        <header className="mb-6">
          <h1 className="text-3xl">Innstillinger</h1>
          <p className="text-sm text-muted-foreground">
            Endringer påvirker fremtidige kunngjøringer. Bruk &quot;Re-score
            alle&quot; på innboksen for å bruke endringene tilbake i tid.
          </p>
        </header>

        <CompanyForm
          initial={initial}
          submitLabel="Lagre endringer"
          showSchedule
          onSubmit={async (value) => {
            try {
              await api.updateCompany(value);
              await qc.invalidateQueries({ queryKey: ["company"] });
              await qc.invalidateQueries({ queryKey: ["notices"] });
              toast.success("Lagret");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Klarte ikke å lagre",
              );
            }
          }}
        />
      </div>
    </AppShell>
  );
}
