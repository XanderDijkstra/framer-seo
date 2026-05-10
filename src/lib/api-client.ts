import type { CompanyProfile, Notice, Score } from "./schema";

export type NoticeWithScore = Notice & { score: Score | null };

export type CompanyInput = {
  companyName: string;
  services: string[];
  cpvCodes: string[];
  searchKeywords: string;
  boostKeywords: string[];
  penaltyKeywords: string[];
  preferredRegions: string[];
  cannotDeliver: string[];
  strengths: string[];
  budgetMin: number;
  budgetMax: number;
  teamSize: number;
  pipelineSchedule: "daily" | "weekly";
};

async function jsonFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

export const api = {
  async getCompany() {
    return jsonFetch<{ company: CompanyProfile | null }>("/api/company");
  },
  async createCompany(body: CompanyInput) {
    return jsonFetch<{ company: CompanyProfile }>("/api/company", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateCompany(body: CompanyInput) {
    return jsonFetch<{ company: CompanyProfile }>("/api/company", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listNotices() {
    return jsonFetch<{
      notices: NoticeWithScore[];
      company: CompanyProfile | null;
    }>("/api/notices");
  },
  async getNotice(id: string) {
    return jsonFetch<{
      notice: NoticeWithScore | null;
      company: CompanyProfile | null;
    }>(`/api/notices/${encodeURIComponent(id)}`);
  },
  async toggleFavorite(id: string, favorited: boolean) {
    return jsonFetch<{ id: string; favorited: boolean }>(
      `/api/notices/${encodeURIComponent(id)}/favorite`,
      {
        method: "POST",
        body: JSON.stringify({ favorited }),
      },
    );
  },
  async runPipeline() {
    return jsonFetch<Record<string, unknown>>("/api/pipeline/run", {
      method: "POST",
    });
  },
  async resetScores() {
    return jsonFetch<{ ok: true }>("/api/scores/reset", { method: "POST" });
  },
};
