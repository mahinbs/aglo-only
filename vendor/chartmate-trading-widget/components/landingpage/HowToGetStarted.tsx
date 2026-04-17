import React from 'react';
import { MousePointerClick, Settings, LineChart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';

const HowToGetStarted = () => {
    return (
        <section className="py-16 px-4 md:px-7 bg-zinc-950 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(6,182,212,0.05)_0%,transparent_70%)] pointer-events-none"></div>

            <div className="container mx-auto !max-w-6xl !bg-black border border-white/5 rounded-3xl p-8 md:p-16 relative z-10 shadow-2xl">
                <div className="grid md:grid-cols-[35%,1fr] gap-12 lg:gap-24 items-center">
                    {/* Left Column - Title & Intro */}
                    <div className="flex flex-col items-start">
                        <ScrollReveal direction="right">
                            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.1] mb-8 tracking-tight">
                                Start Trading<br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary">Smarter In</span><br />
                                Minutes
                            </h2>
                            <Link
                                to="/contact-us"
                                className="inline-flex items-center justify-center bg-cyan-500 text-black font-bold py-4 px-8 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] hover:bg-primary hover:-translate-y-1 transition-all text-base w-full md:w-auto"
                            >
                                Get Instant Analysis
                            </Link>
                        </ScrollReveal>
                    </div>

                    {/* Right Column - Steps */}
                    <div className="relative pl-5 lg:pl-12 border-l border-white/10">
                        <div className="space-y-12">
                            {/* Step 1 */}
                            <ScrollReveal delay={0.1} direction="up">
                                <div className="relative group bg-zinc-900/50 p-6 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all duration-300">
                                    <div className="absolute -left-[calc(1.25rem+1px+1.5rem)] lg:-left-[calc(3rem+1px+1.5rem)] top-8 bg-black border border-cyan-500 w-5 h-5 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.5)] group-hover:scale-125 transition-transform">
                                        <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                                    </div>
                                    <div className="flex items-center mb-4">
                                        <div className="bg-cyan-500/10 p-3 rounded-xl mr-4 border border-cyan-500/20 group-hover:border-cyan-500/40 transition-colors">
                                            <MousePointerClick className="w-6 h-6 text-primary" />
                                        </div>
                                        <h3 className="text-2xl md:text-3xl font-bold text-white group-hover:text-primary transition-colors">1. Select Your Asset</h3>
                                    </div>
                                    <p className="text-gray-400 text-lg leading-relaxed max-w-lg font-light">
                                        Choose from hundreds of supported stocks, crypto pairs, and forex markets. Search by symbol or browse top movers.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Step 2 */}
                            <ScrollReveal delay={0.2} direction="up">
                                <div className="relative group bg-zinc-900/50 p-6 rounded-2xl border border-white/5 hover:border-primary/30 transition-all duration-300">
                                    <div className="absolute -left-[calc(1.25rem+1px+1.5rem)] lg:-left-[calc(3rem+1px+1.5rem)] top-8 bg-black border border-primary w-5 h-5 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.5)] group-hover:scale-125 transition-transform">
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                                    </div>
                                    <div className="flex items-center mb-4">
                                        <div className="bg-primary/10 p-3 rounded-xl mr-4 border border-primary/20 group-hover:border-primary/40 transition-colors">
                                            <Settings className="w-6 h-6 text-blue-400" />
                                        </div>
                                        <h3 className="text-2xl md:text-3xl font-bold text-white group-hover:text-blue-400 transition-colors">2. Define Profile</h3>
                                    </div>
                                    <p className="text-gray-400 text-lg leading-relaxed max-w-lg font-light">
                                        Customize your risk tolerance (Conservative, Moderate, Aggressive) and investment horizon to get tailored insights.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Step 3 */}
                            <ScrollReveal delay={0.3} direction="up">
                                <div className="relative group bg-zinc-900/50 p-6 rounded-2xl border border-white/5 hover:border-secondary/30 transition-all duration-300">
                                    <div className="absolute -left-[calc(1.25rem+1px+1.5rem)] lg:-left-[calc(3rem+1px+1.5rem)] top-8 bg-black border border-secondary w-5 h-5 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.5)] group-hover:scale-125 transition-transform">
                                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                                    </div>
                                    <div className="flex items-center mb-4">
                                        <div className="bg-secondary/10 p-3 rounded-xl mr-4 border border-secondary/20 group-hover:border-secondary/40 transition-colors">
                                            <LineChart className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <h3 className="text-2xl md:text-3xl font-bold text-white group-hover:text-purple-400 transition-colors">3. Get Analysis</h3>
                                    </div>
                                    <p className="text-gray-400 text-lg leading-relaxed max-w-lg font-light">
                                        Receive instant, AI-generated price probabilities, entry/exit points, and risk metrics powered by our in-house AI engine.
                                    </p>
                                </div>
                            </ScrollReveal>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowToGetStarted;
