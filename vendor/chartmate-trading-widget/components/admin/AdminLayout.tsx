import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, BarChart3, FileText, Globe, Link2, LayoutDashboard, Mail, ShieldCheck, Zap, Database, ClipboardList } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { Badge } from "@/components/ui/badge";

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperAdmin } = useAdmin();

  const path = location.pathname;
  const currentTab = path.includes("/admin/predictions")
    ? "daily"
    : path.includes("/admin/blogs")
    ? "blogs"
    : path.includes("/admin/dashboard")
    ? "dashboard"
    : path.includes("/admin/public-dashboard")
    ? "stats"
    : path.includes("/admin/affiliates")
    ? "affiliates"
    : path.includes("/admin/contacts")
    ? "contacts"
    : path.includes("/admin/whitelabels")
    ? "whitelabels"
    : path.includes("/admin/algo-requests")
    ? "algo-requests"
    : path.includes("/admin/algo-access-requests")
    ? "algo-access-requests"
    : "users";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate("/home")} className="hover:bg-white/5">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Home
            </Button>
            <h1 className="text-xl md:text-2xl font-bold text-gradient">Admin Panel</h1>
            {isSuperAdmin && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40 border text-xs flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Super Admin
              </Badge>
            )}
          </div>
          <Tabs
            value={currentTab}
            onValueChange={(v) => {
              if (v === "daily") navigate("/admin/predictions");
              else if (v === "blogs") navigate("/admin/blogs");
              else if (v === "dashboard") navigate("/admin/dashboard");
              else if (v === "stats") navigate("/admin/public-dashboard");
              else if (v === "affiliates") navigate("/admin/affiliates");
              else if (v === "contacts") navigate("/admin/contacts");
              else if (v === "whitelabels") navigate("/admin/whitelabels");
              else if (v === "algo-requests") navigate("/admin/algo-requests");
              else if (v === "algo-access-requests") navigate("/admin/algo-access-requests");
              else navigate("/admin/users");
            }}
          >
            <TabsList className="flex w-full max-w-3xl h-auto flex-wrap gap-1 bg-muted/40 p-1">
              <TabsTrigger value="dashboard" className="flex items-center gap-1.5 text-xs">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                List of Users
              </TabsTrigger>
              <TabsTrigger value="daily" className="flex items-center gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5" />
                Daily Shares
              </TabsTrigger>
              <TabsTrigger value="blogs" className="flex items-center gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Blogs
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-1.5 text-xs">
                <Database className="h-3.5 w-3.5" />
                Dataset
              </TabsTrigger>
              <TabsTrigger value="affiliates" className="flex items-center gap-1.5 text-xs">
                <Link2 className="h-3.5 w-3.5" />
                Affiliates
              </TabsTrigger>
              <TabsTrigger value="contacts" className="flex items-center gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5" />
                Contacts
              </TabsTrigger>
              <TabsTrigger value="algo-requests" className="flex items-center gap-1.5 text-xs">
                <Zap className="h-3.5 w-3.5" />
                Algo Requests
              </TabsTrigger>
              {isSuperAdmin && (
                <TabsTrigger value="algo-access-requests" className="flex items-center gap-1.5 text-xs">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Access requests
                </TabsTrigger>
              )}
              {/* White-labels tab: super-admin only */}
              {isSuperAdmin && (
                <TabsTrigger value="whitelabels" className="flex items-center gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5" />
                  White-labels
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <Outlet />
      </div>
    </div>
  );
}
