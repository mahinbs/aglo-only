import { useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useSignupProfile } from "@/hooks/useSignupProfile";
import { supabase } from "@/integrations/supabase/client";

export default function ProfilePage() {
  const { user } = useAuth();
  const { profile, loading, refresh } = useSignupProfile();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    const meta = user.user_metadata as Record<string, string> | undefined;
    setFullName(
      profile?.full_name?.trim() ||
        (meta?.full_name?.trim() ?? ""),
    );
    setPhone(profile?.phone ?? meta?.phone ?? "");
    setCountry(profile?.country ?? meta?.country ?? "");
  }, [user, profile]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    const name = fullName.trim();
    if (name.length < 2) {
      toast.error("Please enter your full name (at least 2 characters).");
      return;
    }
    setSavingProfile(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({
        data: {
          full_name: name,
          phone: phone.trim(),
          country: country.trim(),
        },
      });
      if (upErr) throw upErr;

      const { error: rowErr } = await (supabase as any)
        .from("user_signup_profiles")
        .upsert(
          {
            user_id: user.id,
            email: user.email ?? null,
            full_name: name,
            phone: phone.trim() || null,
            country: country.trim() || null,
          },
          { onConflict: "user_id" },
        );
      if (rowErr) throw rowErr;

      toast.success("Profile saved.");
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save profile.";
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signErr) {
        toast.error("Current password is incorrect.");
        return;
      }
      const { error: pwErr } = await supabase.auth.updateUser({
        password: newPassword,
        data: { need_password_reset: false },
      });
      if (pwErr) throw pwErr;
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update password.";
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <DashboardShellLayout>
      <div className="mx-auto max-w-2xl space-y-8 pb-10">
        <header className="space-y-4 mb-4 sm:mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs sm:text-[13px] font-semibold text-primary/90 shadow-sm backdrop-blur-sm w-fit">
            <UserRound className="h-4 w-4" />
            Account Overview
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Profile Settings</h1>
            <p className="text-muted-foreground/90 text-sm sm:text-base mt-2 max-w-xl leading-relaxed">
              Manage your personal information, update your contact details, and secure your account with a strong password.
            </p>
          </div>
        </header>

        <Card className="border border-border/50 bg-gradient-to-b from-card/80 to-card/30 shadow-xl backdrop-blur-2xl overflow-hidden rounded-2xl">
          <CardHeader className="bg-primary/5 border-b border-border/50 pb-5">
            <CardTitle className="text-xl font-semibold">Personal details</CardTitle>
            <CardDescription className="text-[13px] opacity-80 mt-1">
              Your sign-in email is fixed. You can update name, phone, and country — saving updates
              your account system-wide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-full-name">Full name</Label>
                  <Input
                    id="profile-full-name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    required
                    minLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    autoComplete="email"
                    value={user?.email ?? ""}
                    readOnly
                    disabled
                    tabIndex={-1}
                    className="cursor-not-allowed bg-muted/50 opacity-100"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed here. Contact support if you need to update your sign-in
                    address.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">Phone</Label>
                    <Input
                      id="profile-phone"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-country">Country / region</Label>
                    <Input
                      id="profile-country"
                      type="text"
                      autoComplete="country-name"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                {profile?.date_of_birth && (
                  <p className="text-xs text-muted-foreground">
                    Date of birth on file:{" "}
                    <span className="text-foreground font-medium">{profile.date_of_birth}</span>
                    {" — "}
                    contact support if it needs correcting.
                  </p>
                )}
                <Button type="submit" disabled={savingProfile} className="gap-2">
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save profile
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-gradient-to-b from-card/80 to-card/30 shadow-xl backdrop-blur-2xl overflow-hidden rounded-2xl">
          <CardHeader className="bg-primary/5 border-b border-border/50 pb-5">
            <CardTitle className="text-xl font-semibold">Security</CardTitle>
            <CardDescription className="text-[13px] opacity-80 mt-1">
              Ensure your account is using a long, random password to stay secure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Confirm new password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" variant="secondary" disabled={savingPassword} className="gap-2">
                {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShellLayout>
  );
}
