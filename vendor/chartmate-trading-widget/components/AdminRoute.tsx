import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminRouteProps {
  children: ReactNode;
}

/**
 * Guards the /admin/* platform panel.
 * Only users with role = 'super_admin' (i.e. trading@admin.com) can enter.
 * Regular 'admin' users are WL partners — they use /wl/:slug/dashboard instead.
 */
export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: adminLoading } = useAdmin();

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if ((user as any).user_metadata?.need_password_reset) return <Navigate to="/auth/change-password" replace />;
  if (!isSuperAdmin) return <Navigate to="/home" replace />;

  return <>{children}</>;
};
