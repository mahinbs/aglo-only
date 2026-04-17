import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Cpu, LayoutDashboard, Settings, User, ActivitySquare } from 'lucide-react';
import { motion } from 'framer-motion';

export function MobileBottomNav() {
  const { role } = useUserRole();
  const location = useLocation();

  const isAffiliate = role === 'affiliate';
  const dashboardTarget = isAffiliate ? '/affiliate/dashboard' : '/trading-dashboard';

  const navItems = [
    { icon: Cpu, label: 'Algo', path: '/trading-dashboard?tab=options' },
    { icon: LayoutDashboard, label: 'Dashboard', path: '/home' },
    { icon: ActivitySquare, label: 'Performance', path: '/active-trades?tab=performance' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  // Helper to determine if a nav item is active, accounting for query params
  const isItemActive = (pathInfo: string) => {
    if (pathInfo.includes('?')) {
      const [path, query] = pathInfo.split('?');
      return location.pathname === path && location.search.includes(query);
    }
    return location.pathname === pathInfo;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 sm:pb-6 bg-transparent pointer-events-none pb-safe">
      <div className="bg-background/85 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-full px-2 py-2 mx-auto max-w-md flex justify-around items-center pointer-events-auto transition-all">
        {navItems.map((item) => {
          const active = isItemActive(item.path);
          return (
            <NavLink
              key={item.label}
              to={item.path}
              className={`relative flex flex-col items-center justify-center w-14 h-12 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-primary/80'
              }`}
            >
              <item.icon className="w-5 h-5 z-10" />
              <span className="text-[9px] font-semibold mt-1 z-10 uppercase tracking-widest">{item.label}</span>
              {active && (
                <motion.div
                  layoutId="mobile-nav-indicator"
                  className="absolute inset-0 bg-primary/10 dark:bg-primary/20 rounded-2xl -z-0"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
