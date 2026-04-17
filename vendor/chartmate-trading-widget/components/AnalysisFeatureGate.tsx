import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { isManualFullAccessEmail } from "@/lib/manualSubscriptionBypass";

/**
 * Requires $99 / $129 (probability or pro) for intraday and other analysis-gated routes.
 * (New / Past Analysis use PredictPastAnalysisGate — exception-email only.)
 */
export function AnalysisFeatureGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { loading, hasAnalysisAccess } = useSubscription();
  const bypass = isManualFullAccessEmail(user?.email);

  if (user && bypass) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (!hasAnalysisAccess) {
    return <Navigate to="/pricing?feature=analysis" replace />;
  }

  return <>{children}</>;
}
