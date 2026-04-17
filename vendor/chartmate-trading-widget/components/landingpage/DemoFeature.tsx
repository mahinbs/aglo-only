import React from 'react';
import { ScrollReveal } from '../ui/ScrollReveal';

const DemoFeature = () => {
    return (
        <section className="py-16 bg-black/50 relative">
            <div className="container mx-auto px-4">
                <div className="grid lg:grid-cols-2 gap-20 items-center">
                    <div className="order-2 lg:order-1">
                        <ScrollReveal direction="right">
                            {/* Mock UI Interface */}
                            <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative transform hover:rotate-1 transition-transform duration-700 ease-out">
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-secondary/5 pointer-events-none"></div>
                                <div className="bg-zinc-950 p-4 border-b border-white/5 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">BMS_AI_PREDICTOR_V4.exe</div>
                                </div>
                                <div className="p-8 font-mono text-sm relative z-10">
                                    <div className="flex justify-between mb-8 items-end">
                                        <div>
                                            <div className="text-gray-500 text-[10px] tracking-widest mb-1">ASSET</div>
                                            <div className="text-3xl font-bold text-white tracking-tight">BTC/USD</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-gray-500 text-[10px] tracking-widest mb-1">TIMEFRAME</div>
                                            <div className="text-white bg-white/10 px-3 py-1 rounded text-xs">15 MINUTES</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-8">
                                        <div className="bg-black/60 p-5 rounded-xl border border-white/5 shadow-inner">
                                            <div className="text-gray-500 text-[10px] tracking-widest mb-2">PROBABILITY</div>
                                            <div className="text-3xl font-bold text-green-400">87% <span className="text-xs text-green-500/70 align-top">BULLISH</span></div>
                                        </div>
                                        <div className="bg-black/60 p-5 rounded-xl border border-white/5 shadow-inner">
                                            <div className="text-gray-500 text-[10px] tracking-widest mb-2">SENTIMENT</div>
                                            <div className="text-3xl font-bold text-primary">GREED <span className="text-xs text-cyan-500/70 align-top">78</span></div>
                                        </div>
                                    </div>

                                    <div className="space-y-4 bg-black/40 p-6 rounded-xl border border-white/5">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">Trend Strength</span>
                                            <div className="flex items-center gap-3">
                                                <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full w-[85%] bg-gradient-to-r from-green-600 to-green-400"></div></div>
                                                <span className="text-white font-bold">STRONG</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">Volatility</span>
                                            <span className="text-yellow-500 font-bold">MODERATE</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">Entry Zone</span>
                                            <span className="text-primary font-bold bg-cyan-900/20 px-2 py-0.5 rounded">67,400 - 67,250</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>

                    <div className="order-1 lg:order-2">
                        <ScrollReveal>
                            <h2 className="text-4xl md:text-5xl font-bold mb-10 text-white">Inside the Software</h2>
                            <ul className="space-y-8">
                                {[
                                    { title: "Probability Score", desc: "Know the math behind every potential move (0-100%)." },
                                    { title: "Sentiment Meter", desc: "Gauge market fear and greed instantly." },
                                    { title: "Volatility Alerts", desc: "Avoid chop. Trade only when volume confirms." },
                                    { title: "Condition Report", desc: "Autodetect Trending vs Sideways markets." }
                                ].map((item, i) => (
                                    <li key={i} className="flex gap-6 group">
                                        <div className="mt-1 w-8 h-8 rounded-full bg-cyan-900/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                                            <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-bold text-white mb-2 group-hover:text-primary transition-colors">{item.title}</h4>
                                            <p className="text-gray-400 font-light leading-relaxed">{item.desc}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </ScrollReveal>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default DemoFeature;
