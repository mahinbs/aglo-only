// Stub: algo-only has no subscription gating — treat every user as having full algo access.
export function useSubscription() {
  return {
    subscription: { plan_id: "pro" },
    hasAlgoAccess: true,
    loading: false,
  };
}
