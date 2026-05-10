import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const company = await db.query.companyProfile.findFirst();
  if (!company) redirect("/onboarding");
  return <Dashboard />;
}
