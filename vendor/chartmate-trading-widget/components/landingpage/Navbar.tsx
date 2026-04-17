import React, { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logo from "../../assets/logo.png";

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasBlogs, setHasBlogs] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Determine if blogs / dashboard pages should be shown in nav
  useEffect(() => {
    const loadFlags = async () => {
      try {
        const [{ count: blogCount }] = await Promise.all([
          supabase.from("blogs").select("id", { head: true, count: "exact" })
        ]);
        setHasBlogs((blogCount ?? 0) > 0);
      } catch (e) {
        console.error("Navbar flags error", e);
      }
    };
    loadFlags();
  }, []);

  const scrollToSection = (sectionId: string) => {
    setIsMobileMenuOpen(false);

    // If we're not on the home page, navigate to home first
    if (location.pathname !== "/") {
      navigate("/", { state: { scrollTo: sectionId } });
      return;
    }

    // Standard smooth scrolling
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 80; // Approximate navbar height
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  // Handle initial navigation with scroll state
  useEffect(() => {
    if (location.state && (location.state as any).scrollTo) {
      const sectionId = (location.state as any).scrollTo;
      // Small timeout to allow page to render
      setTimeout(() => {
        scrollToSection(sectionId);
        // Clear state
        window.history.replaceState({}, document.title);
      }, 100);
    }
  }, [location]);

  return (
    <>
      <nav
        className={`fixed w-full z-50 transition-all duration-300 bg-black/50 ${isScrolled ? "shadow-sm py-4 backdrop-blur-sm" : "py-5"}`}
      >
        <div className="container flex justify-between items-center">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-1"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <img
              src={logo}
              alt="Logo"
              className="w-[3rem] lg:w-[5rem] object-contain"
            />
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/market-picks"
              className="text-white hover:text-primary font-medium transition-colors text-sm"
            >
              Daily Analyses
            </Link>
            <Link
              to="/ai-trading-analysis-and-back-testing"
              className="text-white hover:text-primary font-medium transition-colors text-sm"
            >
              Platform
            </Link>
            <Link
              to="/features"
              className="text-white hover:text-primary font-medium transition-colors text-sm"
            >
              Modules
            </Link>
            <Link
              to="/pricing"
              className="text-white hover:text-primary font-medium transition-colors text-sm"
            >
              Pricing
            </Link>
            <Link
              to="/white-label"
              className="text-white hover:text-primary font-medium transition-colors text-sm"
            >
              White Label
            </Link>
            {hasBlogs && (
              <Link
                to="/blogs"
                className="text-white hover:text-primary font-medium transition-colors text-sm"
              >
                Blogs
              </Link>
            )}
            <Link
              to="/contact-us"
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded text-sm font-bold transition-colors shadow-sm"
            >
              Launch App
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="text-white focus:outline-none"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Offcanvas Menu */}
      <div
        className={`fixed inset-0 z-[60] transform transition-transform duration-300 ease-out md:hidden ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        aria-hidden={!isMobileMenuOpen}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* Panel */}
        <div className="absolute inset-y-0 right-0 w-72 max-w-[80vw] bg-zinc-950 border-l border-white/10 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <img
                src={logo}
                alt="Logo"
                className="w-[3rem] object-contain"
              />
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full border border-white/15 p-2 text-gray-300 hover:bg-white/10 transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2 px-6 py-6 text-sm overflow-y-auto">
            <Link
              to="/market-picks"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-sm font-medium uppercase tracking-wider">
                Daily Analyses
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.6)] group-hover:scale-125 transition-transform" />
            </Link>

            <Link
              to="/ai-trading-analysis-and-back-testing"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-sm font-medium uppercase tracking-wider">
                Platform
              </span>
            </Link>

            <Link
              to="/features"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-sm font-medium uppercase tracking-wider">
                Modules
              </span>
            </Link>

            <Link
              to="/pricing"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-sm font-medium uppercase tracking-wider">
                Pricing
              </span>
            </Link>

            <Link
              to="/white-label"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="text-sm font-medium uppercase tracking-wider">
                White Label
              </span>
            </Link>
            {hasBlogs && (
              <Link
                to="/blogs"
                className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-sm font-medium uppercase tracking-wider">
                  Blogs
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.6)] group-hover:scale-125 transition-transform" />
              </Link>
            )}
            
            <Link
              to="/contact-us"
              className="mt-4 bg-primary hover:bg-primary-hover text-white py-3 rounded text-center font-bold shadow-lg shadow-primary/20 transition-all"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Launch App
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
