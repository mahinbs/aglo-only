import { Brain, Home, Activity, Link2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "AI Analysis", url: "/predict", icon: Brain },
  { title: "Active Trades", url: "/active-trades", icon: Activity },
  { title: "Strategies", url: "/strategies", icon: Brain },
  { title: "Broker Sync", url: "/algo-setup", icon: Link2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === "/") {
      return currentPath === "/";
    }
    return currentPath.startsWith(path);
  };

  const getNavCls = (active: boolean) =>
    active 
      ? "flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary border-l-2 border-primary shadow-[0_0_15px_rgba(20,184,166,0.1)] transition-all duration-300" 
      : "flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all duration-200";

  return (
    <Sidebar className={state === "collapsed" ? "w-14 bg-background border-r border-border" : "w-64 bg-background border-r border-border"} collapsible="icon">
      <SidebarHeader className="p-4 animate-fade-in border-b border-border/50">
        {state !== "collapsed" && (
          <div>
            <h2 className="text-lg font-bold text-gradient">Trading AI</h2>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Market Intelligence</p>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-4 mb-2">Navigation</SidebarGroupLabel>
          <SidebarGroupContent className="animate-fade-in px-2">
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} className="rounded-lg transition-all duration-200">
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/"}
                      className={({ isActive: navActive }) => getNavCls(navActive)}
                    >
                      <item.icon className={`h-5 w-5 ${isActive(item.url) ? 'text-primary' : 'text-muted-foreground'}`} />
                      {state !== "collapsed" && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
