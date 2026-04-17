import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';

const HowToGetStarted = () => {
    return (
        <section className="py-16 bg-zinc-950 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(168,85,247,0.05)_0%,transparent_70%)] pointer-events-none"></div>

            <div className="container mx-auto max-w-5xl relative z-10">
                <ScrollReveal>
                    <div className="sm:bg-gradient-to-br from-zinc-900 to-black sm:border border-white/10 sm:rounded-[3rem] p-0 sm:p-8 md:p-16 text-center relative overflow-hidden shadow-2xl">

                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight relative z-10">
                            Start your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">fintech empire</span> today!
                        </h2>
                        
                        <p className="text-xl text-gray-400 font-light max-w-2xl mx-auto mb-12 relative z-10">
                            Share your details and we'll help you get started with your own branded platform.
                        </p>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-3xl mx-auto mb-12 backdrop-blur-sm relative z-10">
                            <p className="text-lg text-gray-300 leading-relaxed">
                                Ready to get started? Fill in your details and we'll reach out to guide you through the onboarding process.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center relative z-10">
                            <Link
                                to="/contact-us"
                                className="w-full sm:w-auto bg-cyan-500 text-black hover:bg-primary text-lg px-10 py-5 rounded-full font-bold shadow-[0_0_30px_rgba(6,182,212,0.3)] hover:shadow-[0_0_50px_rgba(6,182,212,0.5)] transition-all duration-300 hover:-translate-y-1 flex items-center justify-center"
                            >
                                Get Started Now
                                <ArrowRight className="ml-2 w-5 h-5" />
                            </Link>
                        </div>
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default HowToGetStarted;
