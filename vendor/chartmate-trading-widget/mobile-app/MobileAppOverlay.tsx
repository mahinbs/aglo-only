import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobileApp } from './isMobileDevice';
import { MobileBottomNav } from './MobileBottomNav';
import { isLoggedInAppPath } from '@/App';

export function MobileAppOverlay() {
  const isMobile = useIsMobileApp();
  const { user } = useAuth();
  const { pathname } = useLocation();

  const showBottomNav = isMobile && !!user && isLoggedInAppPath(pathname);

  // Add padding to body when nav is visible so we don't cover content
  useEffect(() => {
    if (showBottomNav) {
      document.body.style.paddingBottom = '80px';
    } else {
      document.body.style.paddingBottom = '0px';
    }
    return () => {
      document.body.style.paddingBottom = '0px';
    };
  }, [showBottomNav]);

  if (!showBottomNav) return null;

  return <MobileBottomNav />;
}
