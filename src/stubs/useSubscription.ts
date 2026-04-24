import { useSubscription as useAlgoOnlySubscription } from "@/hooks/useSubscription";

/**
 * Compatibility shim for vendored ChartMate modules.
 * algo-only only needs core subscription + algo access.
 */
export function useSubscription() {
  const base = useAlgoOnlySubscription();
  return {
    ...base,
    hasAnalysisAccess: false,
    manualFullAccessBypass: false,
    hasBillingIssue: false,
  };
}
