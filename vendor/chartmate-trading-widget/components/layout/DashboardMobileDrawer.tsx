import { forwardRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Lock, LogOut, User, X } from "lucide-react";
import logo from "@/assets/logo.png";
import type { DashboardNavLink } from "./dashboard-nav-types";
import { isDashboardNavActive } from "./dashboard-nav-types";
import { cn } from "@/lib/utils";

export interface DashboardMobileDrawerProps {
  open: boolean;
  onClose: () => void;
  links: DashboardNavLink[];
  userEmail?: string | null;
  /** Full name from signup profile (single field, not email local-part). */
  profileDisplayName: string;
  onSignOut: () => void;
}

export const DashboardMobileDrawer = forwardRef<HTMLDivElement, DashboardMobileDrawerProps>(
  function DashboardMobileDrawer(
    { open, onClose, links, userEmail, profileDisplayName, onSignOut },
    ref,
  ) {
    const { pathname, search } = useLocation();

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-[100] lg:hidden">
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300"
          onClick={onClose}
          aria-hidden
        />
        <aside
          ref={ref}
          className="absolute inset-y-0 left-0 w-[280px] bg-sidebar border-r border-sidebar-border shadow-2xl flex flex-col h-full"
        >
          <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
            <img src={logo} alt="ChartMate" className="h-6 object-contain" />
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 pt-6">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-widest px-2 mb-3.5 font-semibold opacity-80">
                Navigation
              </p>
              <div className="space-y-2">
                {links.map((link) => {
                  const Icon = link.icon;
                  const isActive =
                    link.matchActive === false
                      ? false
                      : isDashboardNavActive(link.to, pathname, search);
                  return (
                    <Link
                      key={link.label}
                      to={link.to}
                      title={link.locked ? "Upgrade to unlock" : undefined}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                        link.locked && "opacity-75",
                        isActive
                          ? "bg-sidebar-primary/10 text-primary border-l-[3px] border-primary font-semibold"
                          : "text-sidebar-foreground hover:text-foreground hover:bg-sidebar-primary/5 border-l-[3px] border-transparent",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          !isActive && link.iconColor,
                          !isActive && link.iconOpacity,
                        )}
                      />
                      <span className="flex-1 truncate">{link.label}</span>
                      {link.locked && (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-80" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-sidebar-border pb-8">
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-foreground border border-border shrink-0">
                <User className="h-5 w-5 opacity-50" />
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to="/profile"
                  onClick={onClose}
                  className="text-sm font-semibold text-foreground truncate leading-tight block hover:text-primary transition-colors"
                >
                  {profileDisplayName}
                </Link>
                <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                  {userEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="text-muted-foreground hover:text-destructive transition-colors px-2 shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    );
  },
);
