import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';

const Hero = () => {
    // Original Animation States
    const [squares, setSquares] = useState<{ top: number, left: number }[]>([]);
    const [drops, setDrops] = useState<{ id: number, key: number, left: number, duration: number, delay: number }[]>([]);

    useEffect(() => {
        const getUniqueLeft = () => {
            return Math.floor(Math.random() * 20) * 80;
        };

        // Generate static squares
        const generateSquares = () => {
            const newSquares = [];
            const numSquares = 5;

            for (let i = 0; i < numSquares; i++) {
                const top = Math.floor(Math.random() * 10) * 80;
                const left = Math.floor(Math.random() * 20) * 80;
                newSquares.push({ top, left });
            }
            setSquares(newSquares);
        };

        // Initialize drops
        const initDrops = () => {
            const newDrops = [];
            const numDrops = 3;

            for (let i = 0; i < numDrops; i++) {
                const left = getUniqueLeft();
                const duration = 2 + Math.random() * 2;
                const delay = Math.random() * 3;
                newDrops.push({
                    id: i,
                    key: i,
                    left,
                    duration,
                    delay
                });
            }
            setDrops(newDrops);
        };

        generateSquares();
        initDrops();

        const interval = setInterval(generateSquares, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleDropAnimationEnd = (dropId: number) => {
        const getUniqueLeft = () => {
            return Math.floor(Math.random() * 20) * 80;
        };

        setDrops(prevDrops => prevDrops.map(drop => {
            if (drop.id === dropId) {
                const left = getUniqueLeft();
                const duration = 2 + Math.random() * 2;
                const delay = Math.random() * 2; // Add small delay
                return {
                    ...drop,
                    key: drop.key + 1,
                    left,
                    duration,
                    delay
                };
            }
            return drop;
        }));
    };

    return (
        <section id="hero" className="relative min-h-screen flex items-center justify-center pt-40 pb-20 px-4 overflow-hidden bg-black">

            {/* Overlay Gradients for Depth */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black z-0 pointer-events-none"></div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-black/60 to-black z-0 pointer-events-none"></div>

            {/* Background Animation Canvas */}
            <div className="absolute inset-0 z-10 pointer-events-none"
                style={{
                    backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
                    backgroundSize: '80px 80px'
                }}
            >
                {/* Animated Elements */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse z-0 hidden md:block"></div>

                {/* Dynamic colored squares */}
                {squares.map((pos, index) => (
                    <div
                        key={`square-${index}`}
                        className="absolute w-[80px] h-[80px] bg-cyan-500/10 transition-all duration-1000 ease-in-out"
                        style={{
                            top: `${pos.top}px`,
                            left: `${pos.left}px`
                        }}
                    ></div>
                ))}

                {/* Drops */}
                {drops.map((drop) => (
                    <div
                        key={`${drop.id}-${drop.key}`}
                        className="absolute w-[2px] h-[150px] bg-gradient-to-b from-transparent to-cyan-500 animate-drop"
                        style={{
                            left: `${drop.left}px`,
                            top: '-150px',
                            animationDuration: `${drop.duration}s`,
                            animationDelay: `${drop.delay}s`
                        }}
                        onAnimationEnd={() => handleDropAnimationEnd(drop.id)}
                    ></div>
                ))}
            </div>

            <div className="container mx-auto z-10 text-center relative">
                <ScrollReveal delay={0.2}>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-primary text-xs md:text-sm font-medium mb-8 backdrop-blur-xl shadow-lg shadow-cyan-900/10">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        White-label the platform. You sell. You earn.
                    </div>
                </ScrollReveal>

                <ScrollReveal delay={0.4}>
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-8 leading-[1.1] max-w-6xl mx-auto text-white drop-shadow-2xl">
                        Build Your <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-secondary animate-gradient">Fintech Empire!</span>
                    </h1>
                </ScrollReveal>

                <ScrollReveal delay={0.6}>
                    <h2 className="text-2xl md:text-3xl text-white font-bold mb-6 max-w-4xl mx-auto">
                        Launch Your Branded AI Algo Trading Platform - Done For You.
                    </h2>
                    <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-12 font-light leading-relaxed">
                        Deploy a professional-grade platform featuring AI-powered strategy validation, <span className="text-white font-medium">custom algo-trading built by our team</span>, and deep backtesting. We handle the complex infrastructure. You own the brand and keep <span className="text-white font-medium">70% of the profits</span>.
                    </p>
                </ScrollReveal>

                <ScrollReveal delay={0.8}>
                    <div className="grid grid-cols-1 sm:flex gap-6 justify-center items-center mb-16">
                        <Link
                            to="/contact-us"
                            className="bg-cyan-500 text-black hover:bg-primary text-lg px-10 py-7 rounded-full font-bold shadow-[0_0_40px_rgba(6,182,212,0.3)] hover:shadow-[0_0_60px_rgba(6,182,212,0.5)] transition-all duration-300 hover:-translate-y-1 flex items-center justify-center"
                        >
                            Acquire Your License
                        </Link>
                    </div>
                </ScrollReveal>

                <ScrollReveal delay={1.0}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 max-w-5xl mx-auto border-t border-white/5 pt-12">
                        {[
                            { label: "Strategy Deployment", value: "72hr", color: "text-primary" },
                            { label: "Revenue Yours", value: "70%", color: "text-white" },
                            { label: "Market Monitoring", value: "24/7", color: "text-white" },
                            { label: "Supported Brokers", value: "40+", color: "text-purple-400" }
                        ].map((stat, i) => (
                            <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-sm hover:border-white/20 transition-colors h-full">
                                <div className={`text-3xl md:text-4xl font-bold ${stat.color} mb-2 tracking-tight`}>{stat.value}</div>
                                <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-[0.1em] font-medium">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default Hero;
