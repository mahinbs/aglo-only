/**
 * WlCheckoutPage — /wl-checkout/:token
 *
 * Single-use 5-year WL payment page.
 * Security rules:
 *   1. Token must exist and be pending + not expired.
 *   2. User must be logged in.
 *   3. Logged-in user's email must match the request email exactly.
 *   4. Only after all three pass → create Stripe Checkout session and redirect.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createCheckoutSession } from "@/services/stripeService";

interface PaymentRequest {
  id: string;
  token: string;
  email: string;
  brand_name: string;
  slug: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  expires_at: string;
}

export default function WlCheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      // 1. Get current session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        // Not logged in — redirect to auth with this page as return URL
        navigate(`/auth?redirect=${encodeURIComponent(`/wl-checkout/${token}`)}`);
        return;
      }

      setCurrentUserEmail(session.user.email ?? null);

      // 2. Load payment request
      const { data, error: fetchErr } = await (supabase as any)
        .from("wl_payment_requests")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (fetchErr || !data) {
        setError("Payment link not found or has expired.");
        setLoading(false);
        return;
      }

      const req = data as PaymentRequest;

      // 3. Validate status and expiry
      if (req.status === "paid") {
        setError("This payment link has already been used.");
        setLoading(false);
        return;
      }
      if (req.status === "cancelled") {
        setError("This payment link has been cancelled.");
        setLoading(false);
        return;
      }
      if (req.status === "expired" || new Date(req.expires_at) < new Date()) {
        setError("This payment link has expired. Please contact support.");
        setLoading(false);
        return;
      }

      // 4. Email match check — the core security gate
      const userEmail = (session.user.email ?? "").toLowerCase().trim();
      const reqEmail  = (req.email ?? "").toLowerCase().trim();

      if (userEmail !== reqEmail) {
        setError(
          `This payment link was sent to ${reqEmail}. You are logged in as ${userEmail}. ` +
          `Please sign out and sign in with the correct account.`
        );
        setLoading(false);
        return;
      }

      setRequest(req);
      setLoading(false);
    };

    init();
  }, [token, navigate]);

  const handlePay = async () => {
    if (!request) return;
    setPaying(true);

    const result = await createCheckoutSession({
      plan_id: "wl_5_years",
      type: "whitelabel",
      success_url: `${window.location.origin}/wl-checkout/${token}?checkout=success`,
      cancel_url:  `${window.location.origin}/wl-checkout/${token}`,
      wl: { brand_name: request.brand_name, slug: request.slug, token: request.token },
    });

    if (result.error) {
      toast.error(result.error);
      setPaying(false);
      return;
    }

    if (result.url) window.location.href = result.url;
  };

  // Check if returning from Stripe
  const params = new URLSearchParams(window.location.search);
  const checkoutSuccess = params.get("checkout") === "success";

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-white">Access Denied</h1>
          <p className="text-zinc-400 text-sm">{error}</p>
          <Button variant="outline" className="border-white/10 text-zinc-300" onClick={() => navigate("/")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (checkoutSuccess) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-green-400 mx-auto" />
          <h1 className="text-2xl font-bold text-white">Payment Successful!</h1>
          <p className="text-zinc-400 text-sm">
            Your 5-year white label account for <strong className="text-white">{request?.brand_name}</strong> is being set up.
            You'll receive access details shortly.
          </p>
          <Button onClick={() => navigate("/")} className="bg-cyan-600 hover:bg-cyan-500">
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <ShieldCheck className="h-12 w-12 text-cyan-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">White Label — 5 Year License</h1>
          <p className="text-zinc-400 text-sm mt-2">
            This is a private payment link created specifically for <strong className="text-cyan-400">{request?.email}</strong>
          </p>
        </div>

        {/* Plan details */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between">
            <span className="text-zinc-400 text-sm">Brand</span>
            <span className="text-white font-medium">{request?.brand_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400 text-sm">Login URL</span>
            <span className="text-cyan-400 font-mono text-sm">/wl/{request?.slug}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400 text-sm">Duration</span>
            <span className="text-white font-medium">5 Years</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-4">
            <span className="text-zinc-400 text-sm">Total</span>
            <span className="text-2xl font-bold text-white">${request?.amount?.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Link expires</span>
            <span className="text-zinc-500">
              {request ? new Date(request.expires_at).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>

        {/* Security notice */}
        <div className="bg-teal-950/40 border border-teal-500/30 rounded-xl px-4 py-3 text-xs text-teal-400">
          🔒 Logged in as <strong>{currentUserEmail}</strong>. Only this account can complete this payment.
        </div>

        <Button
          className="w-full py-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg rounded-xl"
          onClick={handlePay}
          disabled={paying}
        >
          {paying ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
          Pay ${request?.amount?.toLocaleString()} — Proceed to Checkout
        </Button>
      </div>
    </div>
  );
}
