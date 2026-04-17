import React, { useState, useEffect } from "react";
import { FaBars, FaTimes } from "react-icons/fa";
import { Link } from "react-router-dom";
import logoImg from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const BASE_NAV_ITEMS = [
  { id: "affiliate-partner", label: "Affiliates", isRoute: true },
  { id: "contact-us", label: "Contact Us", isRoute: true },
];

/** Platform cluster (audit §5.3) — pricing & white-label live here to match Navbar.tsx on Layout pages. */
const PLATFORM_ITEMS = [
  { id: "ai-trading-analysis-and-back-testing", label: "Analysis & backtesting", isRoute: true },
  { id: "features", label: "All modules", isRoute: true },
  { id: "pricing", label: "Pricing", isRoute: true },
  { id: "white-label", label: "White label", isRoute: true },
];

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;

  const headerOffset = 80;
  const rect = el.getBoundingClientRect();
  const offsetTop = rect.top + window.scrollY - headerOffset;

  window.scrollTo({
    top: offsetTop,
    behavior: "smooth",
  });
};

const AiPredictionHeader: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasBlogs, setHasBlogs] = useState(false);
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const [isMobilePlatformOpen, setIsMobilePlatformOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const loadFlags = async () => {
      try {
        const [{ count: blogCount }] = await Promise.all([
          (supabase as any).from('blogs').select('id', { head: true, count: 'exact' }),
          // (supabase as any).from('public_dashboard_metrics').select('id', { head: true, count: 'exact' }),
        ]);
        setHasBlogs((blogCount ?? 0) > 0);
        // setHasDashboard((dashCount ?? 0) > 0);
      } catch (e) {
        console.error('Navbar flags error', e);
      }
    };
    loadFlags();
  }, []);

  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(hasBlogs ? [{ id: "blogs", label: "Blogs", isRoute: true }] : []),
    // ...(hasDashboard ? [{ id: "dashboard", label: "Dashboard", isRoute: true }] : []),
  ];

  const handleNavClick = (id: string) => {
    scrollToSection(id);
    setIsOpen(false);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="container flex items-center justify-between py-2.5 lg:py-4">
          <div
            className="flex items-center gap-2 cursor-pointer"
          >
            <Link to='/'>
              <img
                src={logoImg}
                alt="TradingSmart.ai"
                className="w-[3rem] lg:w-[5rem] object-contain"
              /></Link>
            {/* <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-white tracking-wide">
                TradingSmart.ai
              </span>
              <span className="text-[10px] uppercase tracking-[0.25em] text-gray-400">
                Market Predictions
              </span>
            </div> */}
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center 2xl:gap-12 gap-8 text-sm font-medium text-gray-300 lg:flex">
            {/* Platform dropdown */}
            <div 
              className="relative group py-4"
              onMouseEnter={() => setIsPlatformOpen(true)}
              onMouseLeave={() => setIsPlatformOpen(false)}
            >
              <button className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer outline-none">
                <span>Platform</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isPlatformOpen ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {isPlatformOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-0 top-full pt-2 w-64"
                  >
                    <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl">
                      {PLATFORM_ITEMS.map((subItem) => (
                        <Link
                          key={subItem.id}
                          to={`/${subItem.id}`}
                          className="flex flex-col px-4 py-3 rounded-xl hover:bg-white/5 hover:text-white transition-all group/item"
                        >
                          <span className="text-sm font-medium">{subItem.label}</span>
                          <div className="h-px w-0 bg-teal-500/50 mt-1 transition-all group-hover/item:w-full" />
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {navItems.map((item) => (
              item.isRoute ? (
                <Link
                  key={item.id}
                  to={`/${item.id}`}
                  className="relative inline-flex items-center gap-1 hover:text-white transition-colors cursor-pointer group"
                >
                  <span>{item.label}</span>
                  <span className="absolute inset-x-0 -bottom-1 h-px scale-x-0 bg-linear-to-r from-primary to-secondary transition-transform duration-200 origin-center group-hover:scale-x-100" />
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className="relative inline-flex items-center gap-1 hover:text-white transition-colors cursor-pointer group"
                >
                  <span>{item.label}</span>
                  <span className="absolute inset-x-0 -bottom-1 h-px scale-x-0 bg-linear-to-r from-primary to-secondary transition-transform duration-200 origin-center group-hover:scale-x-100" />
                </button>
              )
            ))}

            {/* Desktop login / dashboard button */}
            <Link
              to={user ? "/home" : "/auth"}
              className="ml-4 inline-flex items-center rounded-full bg-primary px-8 py-2 font-semibold bg-teal-500 hover:bg-teal-400 text-black text-sm shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:shadow-[0_0_50px_rgba(20,184,166,0.5)] border border-teal-400/50 transition-all duration-300 hover:-translate-y-0.5"
            >
              {user ? "Dashboard" : "Login"}
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            className="inline-flex items-center justify-center rounded-full border border-white/15 p-2 text-gray-200 lg:hidden"
            onClick={() => setIsOpen(true)}
            aria-label="Open navigation"
          >
            <FaBars className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile offcanvas menu */}
      <div
        className={`fixed inset-0 z-50 transform transition-transform duration-300 ease-out lg:hidden ${isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        aria-hidden={!isOpen}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
          onClick={() => setIsOpen(false)}
        />

        {/* Panel */}
        <div className="absolute inset-y-0 right-0 w-72 max-w-[80vw] bg-zinc-950 border-l border-white/10 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <img
                src={logoImg}
                alt="TradingSmart.ai"
                className="w-[3rem] object-contain"
              />
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full border border-white/15 p-2 text-gray-300"
              onClick={() => setIsOpen(false)}
              aria-label="Close navigation"
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex flex-col gap-2 px-6 py-4 text-sm">
            {/* Mobile Platform accordion */}
            <div className="flex flex-col">
              <button 
                onClick={() => setIsMobilePlatformOpen(!isMobilePlatformOpen)}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
              >
                <span className="text-sm font-medium">Platform</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isMobilePlatformOpen ? "rotate-180" : ""}`} />
              </button>
              
              <AnimatePresence>
                {isMobilePlatformOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-white/[0.02] rounded-xl mx-2 mb-2"
                  >
                    {PLATFORM_ITEMS.map((subItem) => (
                      <Link
                        key={subItem.id}
                        to={`/${subItem.id}`}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white transition-colors"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-teal-500/50" />
                        <span className="text-xs">{subItem.label}</span>
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {navItems.map((item) => (
              item.isRoute ? (
                <Link
                  key={item.id}
                  to={`/${item.id}`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
                >
                  <span className="text-sm">
                    {item.label}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.6)] group-hover:scale-125 transition-transform" />
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
                >
                  <span className="text-sm">
                    {item.label}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.6)] group-hover:scale-125 transition-transform" />
                </button>
              )
            ))}

            {/* Mobile login / dashboard button */}
            <Link
              to={user ? "/home" : "/auth"}
              onClick={() => setIsOpen(false)}
              className="mt-4 w-full rounded-xl bg-teal-500 hover:bg-teal-400 text-black py-3 text-center text-sm font-bold tracking-wide transition-colors"
            >
              {user ? "Dashboard" : "Login"}
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
};

export default AiPredictionHeader;
