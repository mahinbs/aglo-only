// Stub: algo-only has no subscription gating — treat every user as having full algo access.
// In production builds, fail fast if this stub is still wired (avoids shipping fake entitlements).
export function useSubscription() {
  const prod =
    import.meta.env.PROD === true ||
    String(import.meta.env.VITE_ENV ?? "").toLowerCase() === "production";
  if (prod) {
    throw new Error(
      "useSubscription stub must not be used in production — replace with real subscription hook.",
    );
  }
  return {
    subscription: { plan_id: "pro" },
    hasAlgoAccess: true,
    loading: false,
  };
}
