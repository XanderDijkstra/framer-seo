"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { CompanyForm, EMPTY_COMPANY } from "@/components/CompanyForm";

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 text-center">
          <h1 className="text-4xl">Velkommen</h1>
          <p className="mt-2 text-muted-foreground">
            Fyll ut firmaprofilen så vi kan finne anbud som passer dere.
          </p>
        </header>

        <CompanyForm
          initial={EMPTY_COMPANY}
          submitLabel="Fullfør"
          onSubmit={async (value) => {
            try {
              await api.createCompany(value);
              await qc.invalidateQueries({ queryKey: ["company"] });
              toast.success("Firmaprofilen er opprettet.");
              router.push("/");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Klarte ikke å lagre",
              );
            }
          }}
        />
      </div>
    </div>
  );
}
