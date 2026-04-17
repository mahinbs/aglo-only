import React, { useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';

const WorkSlider = () => {
    const swiperRef = useRef<any>(null);

    const caseStudies = [
        {
            id: 1,
            client: "Backtesting",
            title: "From history to trade-level review",
            tech: "Replay & reporting",
            description:
                "A trader replayed their rules on years of data with per-trade entries, exits, and indicator context—then used AI-assisted summaries to tighten risk before any live capital went out.",
            image: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=1000",
        },
        {
            id: 2,
            client: "Custom algo",
            title: "Spec in, broker-ready automation out",
            tech: "Engineering-led",
            description:
                "A crossover and filter logic that did not fit off-the-shelf builders was coded by our team, validated in paper mode, and connected to the client’s broker API—same stack as analysis and backtests.",
            image: "https://images.unsplash.com/photo-1591696205602-2f950c417cb9?auto=format&fit=crop&q=80&w=1000",
        },
        {
            id: 3,
            client: "Options + equities",
            title: "One hub for multi-leg workflows",
            tech: "Trading dashboard",
            description:
                "Users managing both spot and options legs kept positions, orders, and armed strategies in one dashboard—reducing context switching and execution errors during volatile sessions.",
            image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=1000",
        }
    ];

    return (
        <section className="py-16 px-4 md:px-7 bg-black">
            <ScrollReveal>
                <div className="container mx-auto !bg-zinc-950/80 border border-white/5 overflow-hidden py-16 !px-6 md:!px-12 rounded-[2.5rem] relative">

                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="flex flex-col md:flex-row justify-between items-end mb-12 relative z-10">
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 md:mb-0 text-white leading-tight tracking-tight">
                            How teams use the <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-primary">platform</span>
                        </h2>

                        <div className="flex space-x-4">
                            <button
                                onClick={() => swiperRef.current?.slidePrev()}
                                className="w-14 h-14 rounded-full border border-white/10 bg-black/50 flex items-center justify-center hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:text-primary transition-all text-white backdrop-blur-sm"
                                aria-label="Previous slide"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            </button>
                            <button
                                onClick={() => swiperRef.current?.slideNext()}
                                className="w-14 h-14 rounded-full border border-white/10 bg-black/50 flex items-center justify-center hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:text-primary transition-all text-white backdrop-blur-sm"
                                aria-label="Next slide"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </button>
                        </div>
                    </div>

                    <Swiper
                        modules={[Navigation]}
                        spaceBetween={30}
                        slidesPerView={1}
                        breakpoints={{
                            768: {
                                slidesPerView: 1.2,
                            }
                        }}
                        onBeforeInit={(swiper: any) => {
                            swiperRef.current = swiper;
                        }}
                        loop={true}
                        className="w-full relative z-10"
                    >
                        {caseStudies.map((study) => (
                            <SwiperSlide key={study.id}>
                                <div className="w-full h-full p-1">
                                    <div className="bg-black/60 rounded-[2rem] border border-white/10 overflow-hidden flex flex-col lg:flex-row min-h-[500px] h-full backdrop-blur-md hover:border-secondary/30 transition-colors group">

                                        <div className="lg:w-[45%] relative p-4 md:p-6 lg:border-r border-white/5">
                                            <div className="relative w-full h-full rounded-xl overflow-hidden min-h-[300px]">
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10"></div>
                                                <img src={study.image} alt={study.title} className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-700" />
                                                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-primary border border-cyan-500/20 shadow-sm z-20">
                                                    {study.client}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lg:w-[55%] p-8 md:p-12 flex flex-col justify-center h-full">
                                            <div className="flex items-center space-x-2 mb-6 bg-cyan-900/20 w-fit px-3 py-1.5 rounded-full border border-cyan-500/20">
                                                <TrendingUp className="w-4 h-4 text-primary" />
                                                <span className="text-primary font-bold text-xs uppercase tracking-widest">{study.tech}</span>
                                            </div>

                                            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight group-hover:text-purple-400 transition-colors">
                                                {study.title}
                                            </h3>
                                            <p className="text-gray-400 text-lg leading-relaxed mb-10 font-light">
                                                {study.description}
                                            </p>
                                            <div>
                                                <Link to="/ai-trading-analysis-and-back-testing" className="inline-flex items-center text-white font-bold text-base hover:text-primary transition-colors">
                                                    See platform tour
                                                    <ArrowRight className="w-5 h-5 ml-2 transform group-hover:translate-x-2 transition-transform" />
                                                </Link>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </SwiperSlide>
                        ))}
                    </Swiper>

                </div>
            </ScrollReveal>
        </section>
    );
};

export default WorkSlider;
