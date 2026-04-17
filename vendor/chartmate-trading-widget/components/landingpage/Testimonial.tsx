import React from 'react';
import { Star } from 'lucide-react';
import { useKeenSlider } from "keen-slider/react"
import "keen-slider/keen-slider.min.css"
import { ScrollReveal } from '../ui/ScrollReveal';

const testimonials = [
    {
        quote: "They translated my rule set into something I could actually run and monitor. Backtests matched what I expected—no mystery box, just my logic with better tooling.",
        author: "Lachlan Ross",
        role: "Swing Trader, Melbourne"
    },
    {
        quote: "Options and equities in one dashboard matter for how I work. Having paper mode before flipping live saved me from dumb execution mistakes.",
        author: "Omar Al-Fayed",
        role: "Multi-asset Trader, Dubai"
    },
    {
        quote: "We needed engineering help, not another indicator pack. The team wired broker connectivity and gave us a clear path from backtest to deployment.",
        author: "Klaus Weber",
        role: "Algorithmic Trader, Munich"
    },
    {
        quote: "I care about control and auditability. Pausing strategies and seeing orders in one place beats juggling five tabs.",
        author: "James Sterling",
        role: "Active Trader, London"
    },
    {
        quote: "The moat for us was custom integration—our spec went in, a working algo came out. That is not something I could ship solo on a weekend.",
        author: "Wei Chen",
        role: "Quant Developer, Singapore"
    },
    {
        quote: "Structured analysis with readable reasons helps me sanity-check ideas before I size up. It complements my process instead of replacing it.",
        author: "Elena Rossi",
        role: "Visual Trader, Toronto"
    }
];

const Testimonial = () => {
    const animation = { duration: 35000, easing: (t: number) => t }
    const [sliderRef] = useKeenSlider<HTMLDivElement>({
        loop: true,
        renderMode: "performance",
        drag: true,
        created(s) {
            s.moveToIdx(5, true, animation)
        },
        updated(s) {
            s.moveToIdx(s.track.details.abs + 5, true, animation)
        },
        animationEnded(s) {
            s.moveToIdx(s.track.details.abs + 5, true, animation)
        },
        breakpoints: {
            "(min-width: 768px)": {
                slides: { perView: 2, spacing: 20 },
            },
            "(min-width: 1024px)": {
                slides: { perView: 3, spacing: 30 },
            },
        },
        slides: { perView: 1, spacing: 15 },
    })

    return (
        <section id="testimonials" className="py-16 bg-zinc-950 border-t border-white/5 overflow-hidden relative">
            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                            Trusted by <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">serious traders</span>
                        </h2>
                    </div>
                </ScrollReveal>

                <ScrollReveal delay={0.2} direction="up">
                    <div ref={sliderRef} className="keen-slider py-4">
                        {testimonials.map((item, index) => (
                            <div key={index} className="keen-slider__slide bg-zinc-900/50 p-8 md:p-10 rounded-3xl border border-white/10 flex flex-col justify-between h-auto min-h-[360px] hover:border-cyan-500/30 transition-colors backdrop-blur-sm group">
                                <div>
                                    <div className="flex space-x-1 mb-6">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className="w-5 h-5 text-cyan-500 fill-current opacity-80 group-hover:opacity-100 transition-opacity" />
                                        ))}
                                    </div>
                                    <p className="text-gray-300 text-lg italic mb-6 leading-relaxed font-light">
                                        "{item.quote}"
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 mt-auto pt-6 border-t border-white/5">
                                    <div className="w-12 h-12 min-w-12 bg-gradient-to-br from-cyan-900 to-black rounded-full flex items-center justify-center font-bold text-primary border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                                        {item.author[0]}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-base">{item.author}</h4>
                                        <span className="text-sm text-gray-500">{item.role}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default Testimonial;
