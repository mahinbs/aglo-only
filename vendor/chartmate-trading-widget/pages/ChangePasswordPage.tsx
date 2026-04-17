import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { isSuperAdmin } = useAdmin();
  const { role } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please confirm your new password.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { need_password_reset: false },
      });
      if (error) throw error;
      toast({ title: "Password updated", description: "You can now use your new password to sign in." });
      const params = new URLSearchParams(location.search);
      const redirect = params.get("redirect");
      if (redirect) {
        navigate(redirect, { replace: true });
        return;
      }
      if (isSuperAdmin) {
        navigate("/admin", { replace: true });
        return;
      }
      if (role === "admin") {
        const { data } = await (supabase as any)
          .from("white_label_tenant_users")
          .select("white_label_tenants(slug)")
          .eq("user_id", user?.id)
          .eq("role", "admin")
          .eq("status", "active")
          .maybeSingle();
        const slug = data?.white_label_tenants?.slug as string | undefined;
        if (slug) {
          navigate(`/wl/${slug}/dashboard`, { replace: true });
          return;
        }
        navigate("/white-label#pricing", { replace: true });
        return;
      }
      if (role === "affiliate") {
        navigate("/affiliate/dashboard", { replace: true });
        return;
      }
      navigate("/home", { replace: true });
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <Lock className="h-10 w-10 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl text-center">Set your new password</CardTitle>
          <CardDescription className="text-center">
            You must change your temporary password before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set password and continue
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground text-center w-full">
            After updating, you will be signed in with your new password.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
