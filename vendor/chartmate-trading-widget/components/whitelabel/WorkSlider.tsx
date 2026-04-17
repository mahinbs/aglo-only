import React from 'react';
import { Play, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';

const WorkSlider = () => {
    return (
        <section className="py-16 px-4 md:px-7 bg-black relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1)_0%,transparent_50%)] pointer-events-none"></div>

            <div className="container mx-auto relative z-10 text-center">
                <ScrollReveal>
                    <h2 className="text-4xl md:text-5xl font-bold mb-12 text-white leading-tight tracking-tight">
                        See The AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-primary">In Action</span>
                    </h2>
                </ScrollReveal>

                <ScrollReveal delay={0.2}>
                    <div className="relative max-w-5xl mx-auto aspect-video bg-zinc-900 rounded-3xl border border-white/10 overflow-hidden shadow-2xl shadow-cyan-900/20 group">
                        <iframe
                            src="https://drive.google.com/file/d/1fM2jZ-PkUMO5f0dfp6DVPOzF0u8JxJ76/preview"
                            width="100%"
                            height="100%"
                            allow="autoplay"
                            className="w-full h-full"
                            title="AI Trading Analysis Platform Demo"
                        ></iframe>
                    </div>
                </ScrollReveal>

                <ScrollReveal delay={0.4}>
                    <div className="mt-12">
                        <Link
                            to="/contact-us"
                            className="inline-flex items-center bg-cyan-500 text-black hover:bg-primary text-lg px-10 py-5 rounded-full font-bold shadow-[0_0_30px_rgba(6,182,212,0.3)] hover:shadow-[0_0_50px_rgba(6,182,212,0.5)] transition-all duration-300 hover:-translate-y-1"
                        >
                            Get Platform Demo
                            <ArrowRight className="ml-2 w-5 h-5" />
                        </Link>
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default WorkSlider;
