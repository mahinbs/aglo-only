import React from 'react';
import { ScrollReveal } from '../ui/ScrollReveal';
import { BsGraphUpArrow } from 'react-icons/bs';
import { FaChartLine, FaGlobe, FaBitcoin, FaBrain } from 'react-icons/fa';
import { MdOutlinePriceChange } from 'react-icons/md';

const SupportedMarkets = () => {
    return (
        <section id="markets" className="py-16 bg-black relative">
            <div className="container mx-auto px-4">
                <ScrollReveal>
                    <h2 className="text-4xl md:text-6xl font-bold mb-20 text-center tracking-tight text-white">Supported Markets</h2>
                </ScrollReveal>

                <div className="grid md:grid-cols-3 gap-8">
                    {/* Stocks */}
                    <ScrollReveal delay={0.1}>
                        <div className="group relative p-1 rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent hover:from-cyan-500/50 transition-all duration-500 h-full">
                            <div className="bg-zinc-950 h-full p-10 rounded-[1.9rem] relative overflow-hidden backdrop-blur-xl">
                                <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-110">
                                    <BsGraphUpArrow className="text-8xl text-cyan-900/40 group-hover:text-cyan-500/20" />
                                </div>
                                <h3 className="text-3xl font-bold mb-4 flex items-center gap-3 text-white"><FaChartLine className="text-primary" /> Stocks</h3>
                                <p className="text-gray-400 mb-8 border-b border-white/5 pb-8">Indian & US Markets</p>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 uppercase tracking-widest font-semibold">Timeframes</span>
                                        <span className="font-mono text-white bg-white/5 px-2 py-1 rounded">5m, 15m, 1h, 1D</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 uppercase tracking-widest font-semibold">Accuracy</span>
                                        <span className="font-mono text-primary font-bold text-lg">65–78%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollReveal>

                    {/* Forex */}
                    <ScrollReveal delay={0.2}>
                        <div className="group relative p-1 rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent hover:from-primary/50 transition-all duration-500 h-full">
                            <div className="bg-zinc-950 h-full p-10 rounded-[1.9rem] relative overflow-hidden backdrop-blur-xl">
                                <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-110">
                                    <FaGlobe className="text-8xl text-blue-900/40 group-hover:text-primary/20" />
                                </div>
                                <h3 className="text-3xl font-bold mb-4 flex items-center gap-3 text-white"><MdOutlinePriceChange className="text-blue-400" /> Forex</h3>
                                <p className="text-gray-400 mb-8 border-b border-white/5 pb-8">Major & Minor Pairs</p>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 uppercase tracking-widest font-semibold">Timeframes</span>
                                        <span className="font-mono text-white bg-white/5 px-2 py-1 rounded">1m, 5m, 15m, 4h</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 uppercase tracking-widest font-semibold">Accuracy</span>
                                        <span className="font-mono text-blue-400 font-bold text-lg">70–82%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollReveal>

                    {/* Crypto */}
                    <ScrollReveal delay={0.3}>
                        <div className="group relative p-1 rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent hover:from-secondary/50 transition-all duration-500 h-full">
                            <div className="bg-zinc-950 h-full p-10 rounded-[1.9rem] relative overflow-hidden backdrop-blur-xl">
                                <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-110">
                                    <FaBitcoin className="text-8xl text-purple-900/40 group-hover:text-secondary/20" />
                                </div>
                                <h3 className="text-3xl font-bold mb-4 flex items-center gap-3 text-white"><FaBrain className="text-purple-400" /> Crypto</h3>
                                <p className="text-gray-400 mb-8 border-b border-white/5 pb-8">BTC, ETH, SOL & Alts</p>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 uppercase tracking-widest font-semibold">Timeframes</span>
                                        <span className="font-mono text-white bg-white/5 px-2 py-1 rounded">15m, 1h, 4h, 1D</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 uppercase tracking-widest font-semibold">Accuracy</span>
                                        <span className="font-mono text-purple-400 font-bold text-lg">62–74%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollReveal>
                </div>
            </div>
        </section>
    );
};

export default SupportedMarkets;
