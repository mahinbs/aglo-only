import { useState, useEffect, useMemo, useRef } from "react";
import type { CountryCode } from "libphonenumber-js";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { getSessionAffiliateAttribution } from "@/hooks/useAffiliateRef";
import { useAuthEmailCooldown } from "@/hooks/useAuthEmailCooldown";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PhoneCountryCodeCombobox } from "@/components/auth/PhoneCountryCodeCombobox";
import {
  buildE164FromNational,
  DEFAULT_SIGNUP_PHONE_ISO,
} from "@/lib/countryDialCodes";
import { PRICING_PLANS } from "@/constants/pricing";
import { premiumPlanCheckoutUrls } from "@/lib/premiumCheckoutUrls";
import { createCheckoutSession } from "@/services/stripeService";
import { useIsMobileApp } from "@/mobile-app/isMobileDevice";

const VALID_PREMIUM_CHECKOUT_PLANS = new Set(PRICING_PLANS.map((p) => p.id));

function computeAgeFromIsoDate(isoDate: string): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function normalizeOtp(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

function EmailCooldownBanner({
  showTimer,
  mmss,
  generic,
}: {
  showTimer: boolean;
  mmss: string;
  generic: boolean;
}) {
  if (!showTimer && !generic) return null;
  return (
    <Alert className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-550 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-50">
      <Clock className="h-4 w-4 text-amber-700 dark:text-amber-200" />
      <AlertTitle>Please wait</AlertTitle>
      <AlertDescription>
        {showTimer ? (
          <>
            You can try again in{" "}
            <span className="font-mono text-base font-semibold tabular-nums">{mmss}</span>{" "}
            (minutes:seconds).
          </>
        ) : (
          <>Too many email requests right now. Try again in a little while.</>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * auth.users enforces unique email; GoTrue returns an error on duplicate signUp.
 * Wording varies by Supabase/GoTrue version, so match several patterns.
 */
function isEmailAlreadyRegisteredAuthError(err: { message?: string; code?: string }): boolean {
  const code = (err.code ?? "").toLowerCase();
  if (code === "user_already_exists" || code === "email_exists") return true;
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already exists") ||
    m.includes("user already") ||
    m.includes("email address is already") ||
    m.includes("email is already") ||
    m.includes("duplicate")
  );
}

type AuthPhase =
  | "tabs"
  | "signup-otp"
  | "forgot-send"
  | "forgot-otp";

type PendingSignupContext = {
  email: string;
  password: string;
  profile: {
    full_name: string;
    date_of_birth: string;
    phone?: string;
    country?: string;
    affiliate_id?: string | null;
    referral_code?: string | null;
  };
};

type AuthEmailOtpAction = "signup_send" | "recovery_send";

type AuthEmailOtpResult = {
  ok: boolean;
  code?: string;
  message?: string;
};

const AuthPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [authPhase, setAuthPhase] = useState<AuthPhase>("tabs");
  const [pendingSignupEmail, setPendingSignupEmail] = useState("");
  const [pendingSignupContext, setPendingSignupContext] = useState<PendingSignupContext | null>(
    null,
  );
  const [signUpOtp, setSignUpOtp] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotPasswordConfirm, setForgotPasswordConfirm] = useState("");

  const [signInData, setSignInData] = useState({ email: "", password: "" });
  const [signUpData, setSignUpData] = useState({
    fullName: "",
    dateOfBirth: "",
    phoneCountryIso: DEFAULT_SIGNUP_PHONE_ISO as CountryCode,
    phoneNational: "",
    country: "",
    email: "",
    password: "",
    confirmPassword: "",
    techProviderAcknowledge: false,
    termsAcknowledge: false,
  });

  const { signIn, user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postAuthCheckoutStartedRef = useRef(false);
  const emailCooldown = useAuthEmailCooldown();
  const [genericEmailRateLimit, setGenericEmailRateLimit] = useState(false);
  const isMobile = useIsMobileApp();

  const sendAuthEmailOtp = async (
    action: AuthEmailOtpAction,
    payload: {
      email: string;
      password?: string;
      profile?: PendingSignupContext["profile"];
    },
  ) => {
    const { data, error } = await supabase.functions.invoke("auth-email-otp", {
      body: {
        action,
        email: payload.email,
        password: payload.password,
        profile: payload.profile,
        redirectTo: `${window.location.origin}/auth`,
      },
    });

    if (error) {
      return {
        ok: false,
        message: "Could not send email. Please try again.",
      } as AuthEmailOtpResult;
    }

    return (data ?? {
      ok: false,
      message: "Could not send email. Please try again.",
    }) as AuthEmailOtpResult;
  };

  const signUpAge = useMemo(
    () => computeAgeFromIsoDate(signUpData.dateOfBirth),
    [signUpData.dateOfBirth],
  );

  useEffect(() => {
    const routeAfterLogin = async () => {
      if (roleLoading || !user) return;
      if ((user as any).user_metadata?.need_password_reset) {
        navigate("/auth/change-password", { replace: true });
        return;
      }

      const plan = searchParams.get("subscribe_plan")?.trim() ?? "";
      if (plan && VALID_PREMIUM_CHECKOUT_PLANS.has(plan) && role === "user") {
        if (postAuthCheckoutStartedRef.current) return;
        postAuthCheckoutStartedRef.current = true;
        const { success_url, cancel_url } = premiumPlanCheckoutUrls(plan);
        const result = await createCheckoutSession({
          plan_id: plan,
          success_url,
          cancel_url,
        });
        if ("error" in result) {
          postAuthCheckoutStartedRef.current = false;
          toast({
            title: "Could not start checkout",
            description: result.error,
            variant: "destructive",
          });
          navigate("/pricing", { replace: true });
          return;
        }
        if (result.url) {
          window.location.href = result.url;
          return;
        }
        postAuthCheckoutStartedRef.current = false;
        navigate("/pricing", { replace: true });
        return;
      }

      if (role === "super_admin") {
        navigate("/admin", { replace: true });
        return;
      }
      if (role === "admin") {
        const { data } = await (supabase as any)
          .from("white_label_tenant_users")
          .select("white_label_tenants(slug)")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("status", "active")
          .maybeSingle();
        const slug = data?.white_label_tenants?.slug as string | undefined;
        if (slug) navigate(`/wl/${slug}/dashboard`, { replace: true });
        else navigate("/white-label#pricing", { replace: true });
        return;
      }
      if (role === "affiliate") navigate("/affiliate/dashboard", { replace: true });
      else if (role === "user") {
        if (isMobile) {
          navigate("/trading-dashboard?tab=options", { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
      }
    };
    routeAfterLogin();
  }, [user, role, roleLoading, navigate, searchParams]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(signInData.email, signInData.password);

      if (error) {
        toast({
          title: "Sign in failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = signUpData.fullName.trim();
    if (name.length < 2) {
      toast({
        title: "Name required",
        description: "Please enter your full name (at least 2 characters).",
        variant: "destructive",
      });
      return;
    }

    if (!signUpData.dateOfBirth) {
      toast({
        title: "Date of birth required",
        description: "Please select your date of birth.",
        variant: "destructive",
      });
      return;
    }

    const age = computeAgeFromIsoDate(signUpData.dateOfBirth);
    if (age == null) {
      toast({
        title: "Invalid date of birth",
        description: "Use a valid calendar date.",
        variant: "destructive",
      });
      return;
    }
    if (age < 13) {
      toast({
        title: "Age requirement",
        description: "You must be at least 13 years old to create an account.",
        variant: "destructive",
      });
      return;
    }
    if (age > 120) {
      toast({
        title: "Invalid date of birth",
        description: "Please check the year you entered.",
        variant: "destructive",
      });
      return;
    }

    if (signUpData.password !== signUpData.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (signUpData.password.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (!signUpData.techProviderAcknowledge) {
      toast({
        title: "Acknowledgment required",
        description: "Please acknowledge that this platform is only a technology provider.",
        variant: "destructive",
      });
      return;
    }

    if (!signUpData.termsAcknowledge) {
      toast({
        title: "Terms & Conditions",
        description: "Please agree to the Terms & Conditions before signing up.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const phoneE164 = buildE164FromNational(
        signUpData.phoneCountryIso,
        signUpData.phoneNational,
      );
      const email = signUpData.email.trim().toLowerCase();
      const password = signUpData.password;
      const { affiliateId, referralCode } = getSessionAffiliateAttribution();
      const profile: PendingSignupContext["profile"] = {
        full_name: name,
        date_of_birth: signUpData.dateOfBirth,
        phone: phoneE164,
        country: signUpData.country,
        affiliate_id: affiliateId,
        referral_code: referralCode ?? undefined,
      };
      const result = await sendAuthEmailOtp("signup_send", {
        email,
        password,
        profile,
      });

      if (!result.ok) {
        if (
          result.code === "user_exists" ||
          isEmailAlreadyRegisteredAuthError({
            message: result.message,
            code: result.code,
          })
        ) {
          toast({
            title: "Account exists",
            description: "An account with this email already exists. Please sign in instead.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Sign up failed",
            description: result.message ?? "Could not start signup verification.",
            variant: "destructive",
          });
        }
        return;
      }

      setGenericEmailRateLimit(false);
      setPendingSignupEmail(email);
      setPendingSignupContext({ email, password, profile });
      setSignUpOtp("");
      setAuthPhase("signup-otp");
      toast({
        title: "Check your email",
        description: "We sent a 6-digit code to complete signup.",
      });
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeOtp(signUpOtp);
    if (token.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code from your email.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingSignupEmail,
        token,
        type: "signup",
      });
      if (error) {
        toast({
          title: "Verification failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      if (data.session) {
        toast({ title: "Email verified", description: "You're signed in." });
        setAuthPhase("tabs");
        setSignUpOtp("");
        setPendingSignupContext(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendSignupOtp = async () => {
    if (!pendingSignupContext) {
      toast({
        title: "Session expired",
        description: "Please sign up again to resend the code.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const result = await sendAuthEmailOtp("signup_send", {
        email: pendingSignupContext.email,
        password: pendingSignupContext.password,
        profile: pendingSignupContext.profile,
      });
      if (!result.ok) {
        toast({
          title: "Could not resend",
          description: result.message ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      setGenericEmailRateLimit(false);
      toast({ title: "Code sent", description: "Check your inbox for a new code." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!email) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const result = await sendAuthEmailOtp("recovery_send", {
        email,
      });
      if (!result.ok) {
        toast({
          title: "Request failed",
          description: result.message ?? "Could not send reset code.",
          variant: "destructive",
        });
        return;
      }
      setGenericEmailRateLimit(false);
      setForgotOtp("");
      setForgotPassword("");
      setForgotPasswordConfirm("");
      setAuthPhase("forgot-otp");
      toast({
        title: "Check your email",
        description: "We sent a 6-digit code to reset your password.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendRecoveryOtp = async () => {
    const email = forgotEmail.trim();
    if (!email) return;
    setIsLoading(true);
    try {
      const result = await sendAuthEmailOtp("recovery_send", {
        email,
      });
      if (!result.ok) {
        toast({
          title: "Could not resend",
          description: result.message ?? "Could not send reset code.",
          variant: "destructive",
        });
        return;
      }
      setGenericEmailRateLimit(false);
      toast({ title: "Code sent", description: "Check your inbox for a new code." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeOtp(forgotOtp);
    if (token.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code from your email.",
        variant: "destructive",
      });
      return;
    }
    if (forgotPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    if (forgotPassword !== forgotPasswordConfirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: forgotEmail.trim(),
        token,
        type: "recovery",
      });
      if (error) {
        toast({
          title: "Verification failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: forgotPassword,
      });
      if (updateErr) {
        toast({
          title: "Could not set password",
          description: updateErr.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Password updated",
        description: "You're signed in with your new password.",
      });
      setAuthPhase("tabs");
      setForgotOtp("");
      setForgotPassword("");
      setForgotPasswordConfirm("");
      if (!data.session) {
        navigate("/home", { replace: true });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const backToTabs = () => {
    setAuthPhase("tabs");
    setSignUpOtp("");
    setPendingSignupContext(null);
    setForgotOtp("");
    setForgotPassword("");
    setForgotPasswordConfirm("");
  };

  if (authPhase === "signup-otp") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Enter verification code</CardTitle>
            <CardDescription className="text-center">
              We emailed a 6-digit code to <strong className="text-foreground">{pendingSignupEmail}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailCooldownBanner
              showTimer={emailCooldown.active}
              mmss={emailCooldown.mmss}
              generic={genericEmailRateLimit && !emailCooldown.active}
            />
            <form onSubmit={handleVerifySignupOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-otp">6-digit code</Label>
                <Input
                  id="signup-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={12}
                  className="text-center text-2xl tracking-[0.4em] font-mono"
                  value={signUpOtp}
                  onChange={(e) => setSignUpOtp(normalizeOtp(e.target.value))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & continue
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || emailCooldown.active}
                onClick={handleResendSignupOtp}
              >
                {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Resend code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToTabs}>
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authPhase === "forgot-send") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Reset password</CardTitle>
            <CardDescription className="text-center">
              We&apos;ll email you a 6-digit code. Enter it on the next step with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailCooldownBanner
              showTimer={emailCooldown.active}
              mmss={emailCooldown.mmss}
              generic={genericEmailRateLimit && !emailCooldown.active}
            />
            <form onSubmit={handleSendPasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || emailCooldown.active}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Send code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToTabs}>
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authPhase === "forgot-otp") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Set new password</CardTitle>
            <CardDescription className="text-center">
              Code sent to <strong className="text-foreground">{forgotEmail.trim()}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailCooldownBanner
              showTimer={emailCooldown.active}
              mmss={emailCooldown.mmss}
              generic={genericEmailRateLimit && !emailCooldown.active}
            />
            <form onSubmit={handleVerifyRecoveryOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-otp">6-digit code</Label>
                <Input
                  id="recovery-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={12}
                  className="text-center text-2xl tracking-[0.4em] font-mono"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(normalizeOtp(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-pass">New password</Label>
                <Input
                  id="recovery-pass"
                  type="password"
                  autoComplete="new-password"
                  value={forgotPassword}
                  onChange={(e) => setForgotPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-pass2">Confirm new password</Label>
                <Input
                  id="recovery-pass2"
                  type="password"
                  autoComplete="new-password"
                  value={forgotPasswordConfirm}
                  onChange={(e) => setForgotPasswordConfirm(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify code & update password
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || emailCooldown.active}
                onClick={handleResendRecoveryOtp}
              >
                {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Resend code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToTabs}>
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Market Predictor AI</CardTitle>
          <CardDescription className="text-center">
            Sign in to access AI-powered market predictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailCooldownBanner
            showTimer={emailCooldown.active}
            mmss={emailCooldown.mmss}
            generic={genericEmailRateLimit && !emailCooldown.active}
          />
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="Enter your email"
                    value={signInData.email}
                    onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="Enter your password"
                    value={signInData.password}
                    onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="w-full text-sm text-muted-foreground"
                  onClick={() => {
                    setForgotEmail(signInData.email);
                    setAuthPhase("forgot-send");
                  }}
                >
                  Forgot password?
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    value={signUpData.fullName}
                    onChange={(e) => setSignUpData({ ...signUpData, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-dob">Date of birth</Label>
                  <Input
                    id="signup-dob"
                    type="date"
                    value={signUpData.dateOfBirth}
                    onChange={(e) => setSignUpData({ ...signUpData, dateOfBirth: e.target.value })}
                    required
                  />
                  {signUpAge != null && (
                    <p className="text-xs text-muted-foreground">
                      Age: <span className="font-medium text-foreground">{signUpAge}</span> years
                      (stored at signup)
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Phone (optional)</Label>
                  <div className="flex flex-row gap-2 sm:gap-3 items-end">
                    <div className="space-y-1.5 w-[5.25rem] sm:w-24 shrink-0">
                      <span className="text-xs text-muted-foreground">Code</span>
                      <PhoneCountryCodeCombobox
                        id="signup-phone-code"
                        value={signUpData.phoneCountryIso}
                        onValueChange={(iso) =>
                          setSignUpData({
                            ...signUpData,
                            phoneCountryIso: iso,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground">Phone number</span>
                      <Input
                        id="signup-phone-national"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="National number (digits only)"
                        className="h-10 w-full"
                        value={signUpData.phoneNational}
                        onChange={(e) =>
                          setSignUpData({ ...signUpData, phoneNational: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-country">Country / region (optional)</Label>
                  <Input
                    id="signup-country"
                    type="text"
                    autoComplete="country-name"
                    placeholder="e.g. United States"
                    value={signUpData.country}
                    onChange={(e) => setSignUpData({ ...signUpData, country: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="Enter your email"
                    value={signUpData.email}
                    onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create a password (min. 6 characters)"
                    value={signUpData.password}
                    onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm password</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    placeholder="Confirm your password"
                    value={signUpData.confirmPassword}
                    onChange={(e) =>
                      setSignUpData({ ...signUpData, confirmPassword: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="flex items-start space-x-3 pt-2">
                  <Checkbox
                    id="techProviderAcknowledgeAuth"
                    className="mt-1 flex-shrink-0"
                    checked={signUpData.techProviderAcknowledge}
                    onCheckedChange={(checked) => setSignUpData({ ...signUpData, techProviderAcknowledge: checked === true })}
                    required
                  />
                  <Label htmlFor="techProviderAcknowledgeAuth" className="text-sm text-foreground font-normal leading-tight cursor-pointer">
                    I understand that this platform is only a technology provider and does not offer any investment advice or trading strategies.
                  </Label>
                </div>
                <div className="flex items-start space-x-3 pt-2">
                  <Checkbox
                    id="termsAcknowledgeAuth"
                    className="mt-1 flex-shrink-0"
                    checked={signUpData.termsAcknowledge}
                    onCheckedChange={(checked) => setSignUpData({ ...signUpData, termsAcknowledge: checked === true })}
                    required
                  />
                  <Label htmlFor="termsAcknowledgeAuth" className="text-sm text-foreground font-normal leading-tight cursor-pointer">
                    I agree to the <Link to="/terms" className="text-teal-500 hover:underline">Terms & Conditions</Link>
                  </Label>
                </div>
                <Button type="submit" className="w-full mt-4" disabled={isLoading || emailCooldown.active}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground text-center w-full">
            Get access to AI-powered predictions and market analysis tools.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AuthPage;
