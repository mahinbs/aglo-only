import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";

/**
 * New Analysis (/predict) and Past Analyses (/predictions) — visible and reachable only for
 * emails in ANALYSIS_EXCEPTION_EMAILS (see manualSubscriptionBypass.ts).
 */
export function PredictPastAnalysisGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth?redirect=/home" replace />;
  }

  if (isAnalysisExceptionEmail(user.email)) {
    return <>{children}</>;
  }

  return <Navigate to="/home" replace />;
}
