import React from 'react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';
import { Twitter, Linkedin, Github, ArrowRight } from 'lucide-react';

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
                                Ready to launch your <span className="text-primary">Empire?</span>
                            </h2>
                            <p className="text-gray-400 max-w-xl text-lg">
                                Secure your institutional infrastructure today. Partner slots are limited by geographic region.
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
                        <ScrollReveal delay={0.1}>
                            <Link to="/" className="inline-block mb-6">
                                <span className="text-2xl font-black text-white tracking-tighter">
                                    Boostmysites
                                </span>
                            </Link>
                            <p className="text-gray-400 leading-relaxed mb-8 max-w-sm">
                                A turnkey AI algo trading platform built for white-label partners. Fully brandable and deployable on your own domain.
                            </p>
                            <div className="flex space-x-4">
                                <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-cyan-500 hover:text-black transition-all duration-300">
                                    <Twitter className="w-5 h-5" />
                                </a>
                                <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-cyan-500 hover:text-black transition-all duration-300">
                                    <Linkedin className="w-5 h-5" />
                                </a>
                                <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-cyan-500 hover:text-black transition-all duration-300">
                                    <Github className="w-5 h-5" />
                                </a>
                            </div>
                        </ScrollReveal>
                    </div>

                    {/* Links Columns (Span 3 each) */}
                    <div className="lg:col-span-3 lg:col-start-7">
                        <ScrollReveal delay={0.2}>
                            <h4 className="font-bold text-white mb-6">Product</h4>
                            <ul className="space-y-4 text-sm text-gray-400">
                                <li><Link to="/predict" className="hover:text-primary transition-colors">AI Analysis</Link></li>
                                <li><Link to="/intraday" className="hover:text-primary transition-colors">Intraday</Link></li>
                                <li><Link to="/predictions" className="hover:text-primary transition-colors">History</Link></li>
                                <li><Link to="/active-trades" className="hover:text-primary transition-colors">Track Trades</Link></li>
                            </ul>
                        </ScrollReveal>
                    </div>

                    <div className="lg:col-span-3">
                        <ScrollReveal delay={0.4}>
                            <h4 className="font-bold text-white mb-6">Legal</h4>
                            <ul className="space-y-4 text-sm text-gray-400">
                                <li><Link to="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                                <li><Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                                <li><Link to="/risk-disclaimer" className="hover:text-primary transition-colors">Risk Disclaimer</Link></li>
                            </ul>
                        </ScrollReveal>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
                    <p>&copy; {new Date().getFullYear()} Boostmysites. All rights reserved.</p>
                    <div className="flex items-center gap-2 mt-4 md:mt-0">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-gray-400 font-medium">Systems Operational</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
