import { type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { DashboardSidebar } from "./DashboardSidebar";
import { cn } from "@/lib/utils";

export interface DashboardShellLayoutProps {
  children: ReactNode;
  className?: string;
}

export function DashboardShellLayout({ children, className }: DashboardShellLayoutProps) {
  return (
    <div
      className={cn(
        "flex h-screen w-full bg-background text-foreground overflow-hidden font-sans",
        className,
      )}
    >
      <DashboardSidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background relative z-10 min-w-0">
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-12 pt-16 lg:pt-4 flex flex-col gap-6 no-scrollbar relative">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Same shell as {@link DashboardShellLayout} but renders an {@link Outlet} for nested routes — keeps the sidebar mounted when switching between sibling paths (e.g. AI analysis ↔ backtest). */
export function DashboardShellOutletLayout({ className }: { className?: string }) {
  return (
    <DashboardShellLayout className={className}>
      <Outlet />
    </DashboardShellLayout>
  );
}
