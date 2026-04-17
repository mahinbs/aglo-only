/** Success/cancel URLs for public premium (Starter / Growth / Pro) checkout. */
export function premiumPlanCheckoutUrls(planId: string) {
  const origin = window.location.origin;
  return {
    success_url:
      planId === "starterPlan"
        ? `${origin}/algo-setup?checkout=success`
        : `${origin}/home?checkout=success`,
    cancel_url: `${origin}/pricing`,
  };
}
