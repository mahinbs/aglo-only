import React from "react";
import { Link } from "react-router-dom";
import { ScrollReveal } from "../ui/ScrollReveal";
import { Twitter, Linkedin, Github, ArrowRight } from "lucide-react";
import logoImg from "../../assets/logo.png";

const Footer = () => {
  return (
    <footer className="bg-black border-t border-white/10 pt-20 pb-10 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Top CTA Section */}
        <ScrollReveal>
          <div className="flex flex-col md:flex-row justify-between items-center bg-zinc-900/30 border border-white/5 rounded-3xl p-8 md:p-12 mb-20 backdrop-blur-sm">
            <div className="mb-8 md:mb-0 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to launch your{" "}
                <span className="text-primary">Empire?</span>
              </h2>
              <p className="text-gray-400 max-w-xl text-lg">
                Secure your institutional infrastructure today. Partner slots
                are limited by geographic region.
              </p>
            </div>
            <Link
              to="/contact-us"
              className="bg-white text-black hover:bg-cyan-50 font-bold py-4 px-8 rounded-full shadow-lg shadow-white/10 hover:shadow-cyan-500/20 transition-all duration-300 flex items-center group"
            >
              Acquire License
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </ScrollReveal>

        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 mb-20 border-b border-white/5 pb-12">
          {/* Brand Column (Span 5) */}
          <div className="lg:col-span-5">
            <ScrollReveal>
              <img
                src={logoImg}
                alt="TradingSmart.ai"
                className="w-[6rem] md:w-[8rem]"
              />
              <div className="space-y-6 mb-10 max-w-xl">
                <p className="text-gray-400 text-lg leading-relaxed font-light">
                  Data-driven probabilities for Stocks, Forex &amp; Crypto. Not
                  signals or investment advice. Always trade with proper risk
                  management.
                </p>
              </div>
              <Link
                to="/contact-us"
                className="inline-block bg-white text-black font-bold py-4 px-8 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all text-base"
              >
                Start Analysis Now
              </Link>
            </ScrollReveal>
          </div>

          {/* Links Columns (Span 3 each) */}
          <div className="lg:col-span-3 lg:col-start-7">
            <ScrollReveal delay={0.2}>
              <h4 className="font-bold text-white mb-6">Product</h4>
              <ul className="space-y-4 text-sm text-gray-400">
                <li>
                  <Link
                    to="/predict"
                    className="hover:text-primary transition-colors"
                  >
                    AI Analysis
                  </Link>
                </li>
                <li>
                  <Link
                    to="/intraday"
                    className="hover:text-primary transition-colors"
                  >
                    Intraday
                  </Link>
                </li>
                <li>
                  <Link
                    to="/predictions"
                    className="hover:text-primary transition-colors"
                  >
                    History
                  </Link>
                </li>
                <li>
                  <Link
                    to="/active-trades"
                    className="hover:text-primary transition-colors"
                  >
                    Track Trades
                  </Link>
                </li>
              </ul>
            </ScrollReveal>
          </div>

          <div className="lg:col-span-3">
            <ScrollReveal delay={0.4}>
              <h4 className="font-bold text-white mb-6">Legal</h4>
              <ul className="space-y-4 text-sm text-gray-400">
                <li>
                  <Link
                    to="/privacy-policy"
                    className="hover:text-primary transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    to="/terms"
                    className="hover:text-primary transition-colors"
                  >
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link
                    to="/risk-disclaimer"
                    className="hover:text-primary transition-colors"
                  >
                    Risk Disclaimer
                  </Link>
                </li>
              </ul>
            </ScrollReveal>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
          <div className="flex flex-col space-y-2">
            <p className="max-w-2xl text-[10px] md:text-sm text-gray-400 font-medium pb-2 border-b border-white/5 md:border-none md:pb-0">
              We are not registered as an Investment Adviser or Research Analyst under SEBI regulations as we do not provide any advisory or research services. This is a technology platform only.
            </p>
            <p>
              &copy; {new Date().getFullYear()} Boostmysites. All rights reserved.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-gray-400 font-medium">
              Systems Operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
