import { useState, useEffect } from 'react';

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      platform: string;
    };
  }
}

export function useIsMobileApp() {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      // Check for native app via Capacitor
      if (window.Capacitor?.isNativePlatform?.()) {
        return true;
      }
      
      // Fallback for testing on standard web browsers
      return window.innerWidth <= 768;
    };

    setIsMobile(checkMobile());

    const handleResize = () => setIsMobile(checkMobile());
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}
