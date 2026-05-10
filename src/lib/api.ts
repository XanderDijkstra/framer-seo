import { supabase } from "./supabase";
import { matchesPenalty } from "./keywords";
import type { Database } from "./database.types";

type Notice = Database["public"]["Tables"]["notices"]["Row"];
type Score = Database["public"]["Tables"]["scores"]["Row"];
type CompanyProfile =
  Database["public"]["Tables"]["company_profile"]["Row"];

export type NoticeWithScore = Notice & {
  score: Score | null;
  is_favorite: boolean;
};

export async function fetchMyProfile() {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userResp.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMyCompany(): Promise<CompanyProfile | null> {
  const profile = await fetchMyProfile();
  if (!profile?.company_id) return null;
  const { data, error } = await supabase
    .from("company_profile")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchNoticesWithScores(): Promise<{
  notices: NoticeWithScore[];
  company: CompanyProfile | null;
}> {
  const company = await fetchMyCompany();
  if (!company) return { notices: [], company: null };

  // Pull all scores for my company first — they tell us which notices to show.
  const { data: myScores, error: scoreErr } = await supabase
    .from("scores")
    .select("*")
    .eq("company_id", company.id);
  if (scoreErr) throw scoreErr;

  const noticeIds = (myScores ?? []).map((s) => s.notice_id);
  if (!noticeIds.length) return { notices: [], company };

  const [{ data: notices, error: nErr }, { data: favs, error: fErr }] =
    await Promise.all([
      supabase
        .from("notices")
        .select("*")
        .in("id", noticeIds)
        .order("fetched_at", { ascending: false }),
      supabase
        .from("company_favorites")
        .select("notice_id")
        .eq("company_id", company.id),
    ]);
  if (nErr) throw nErr;
  if (fErr) throw fErr;

  const scoreByNotice = new Map<string, Score>(
    (myScores ?? []).map((s) => [s.notice_id, s]),
  );
  const favSet = new Set((favs ?? []).map((f) => f.notice_id));

  const enriched: NoticeWithScore[] = (notices ?? []).map((n) => ({
    ...n,
    score: scoreByNotice.get(n.id) ?? null,
    is_favorite: favSet.has(n.id),
  }));

  // Defense-in-depth: filter out anything matching current penalty keywords,
  // even if the backend hasn't re-scored after the keyword was added.
  const penalty = company.penalty_keywords ?? [];
  const filtered = penalty.length
    ? enriched.filter(
        (n) =>
          !matchesPenalty(`${n.title} ${n.description ?? ""}`, penalty),
      )
    : enriched;

  // Sort by composite desc, nulls last.
  filtered.sort((a, b) => {
    const ac = a.score?.composite ?? -1;
    const bc = b.score?.composite ?? -1;
    return bc - ac;
  });

  return { notices: filtered, company };
}

export async function fetchNoticeById(noticeId: string) {
  const company = await fetchMyCompany();
  if (!company) return null;

  const [{ data: notice }, { data: score }, { data: fav }] = await Promise.all(
    [
      supabase.from("notices").select("*").eq("id", noticeId).maybeSingle(),
      supabase
        .from("scores")
        .select("*")
        .eq("notice_id", noticeId)
        .eq("company_id", company.id)
        .maybeSingle(),
      supabase
        .from("company_favorites")
        .select("id")
        .eq("notice_id", noticeId)
        .eq("company_id", company.id)
        .maybeSingle(),
    ],
  );

  if (!notice) return null;
  return {
    notice,
    score: score ?? null,
    is_favorite: !!fav,
    company,
  };
}

export async function toggleFavorite(noticeId: string, value: boolean) {
  const company = await fetchMyCompany();
  if (!company) throw new Error("Ingen firmaprofil funnet");

  if (value) {
    const { error } = await supabase
      .from("company_favorites")
      .insert({ company_id: company.id, notice_id: noticeId });
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await supabase
      .from("company_favorites")
      .delete()
      .eq("company_id", company.id)
      .eq("notice_id", noticeId);
    if (error) throw error;
  }
}

export async function invokeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw error;
  return data as T;
}

export async function rescoreAllForMyCompany() {
  const company = await fetchMyCompany();
  if (!company) throw new Error("Ingen firmaprofil funnet");
  const { error } = await supabase
    .from("scores")
    .delete()
    .eq("company_id", company.id);
  if (error) throw error;
}
