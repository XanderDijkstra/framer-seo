import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyProfile } from "@/lib/api";

type Props = {
  children: ReactNode;
  requireCompany?: boolean;
};

export function ProtectedRoute({ children, requireCompany = true }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: fetchMyProfile,
    enabled: !!user,
    staleTime: 30_000,
  });

  if (loading || (user && profileQuery.isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Laster…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requireCompany && !profileQuery.data?.company_id) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
