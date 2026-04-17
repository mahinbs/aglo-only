import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

interface FAQItemProps {
    question: string;
    answer: string;
    isOpen: boolean;
    onClick: () => void;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onClick }) => {
    return (
        <div className="bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden mb-4 transition-all hover:border-cyan-500/30">
            <button
                className="w-full px-6 py-6 flex justify-between items-center text-left focus:outline-none bg-transparent hover:bg-white/5 transition-colors"
                onClick={onClick}
            >
                <span className="text-lg font-bold text-white pr-8 flex items-center">
                    <HelpCircle className="w-5 h-5 text-cyan-500 mr-4 opacity-70" />
                    {question}
                </span>
                <span className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : 'text-gray-500'}`}>
                    <ChevronDown className="w-5 h-5" />
                </span>
            </button>
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="px-6 pb-6 pt-0 pl-14 text-gray-400 font-light leading-relaxed text-base">
                    {answer}
                </div>
            </div>
        </div>
    );
};

const FAQ = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const faqs = [
        {
            question: "What is included in the platform?",
            answer:
                "Subscribers get the same product surface: AI-assisted analysis, deep backtesting, strategy management, an options-focused workspace, and paper-to-live trade tracking. Custom algo integration is how we encode your logic and deploy it—plans differ on billing and support, not on hiding major modules.",
        },
        {
            question: "Do you execute trades or give recommendations?",
            answer:
                "No. TradingSmart is a technology platform. Users define or approve their own strategy logic; we provide infrastructure, integration, and tooling—not investment advice or trade tips.",
        },
        {
            question: "What markets and brokers are supported?",
            answer:
                "We integrate with brokers that expose APIs (e.g. Zerodha, Fyers, Dhan, and others). Supported symbols and asset classes depend on your broker and data feeds.",
        },
        {
            question: "Can users paper trade before going live?",
            answer:
                "Yes. Paper workflows help validate process and controls before connecting live capital and broker execution.",
        },
    ];

    const handleToggle = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section id="faq" className="py-16 bg-zinc-950 relative">
            <div className="container mx-auto px-4 max-w-4xl relative z-10">
                <ScrollReveal>
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
                            Frequently Asked <span className="text-primary">Questions</span>
                        </h2>
                        <p className="text-xl text-gray-400 font-light">
                            How the platform works—and what we do not provide.
                        </p>
                    </div>
                </ScrollReveal>

                <div>
                    {faqs.map((faq, index) => (
                        <ScrollReveal key={index} delay={0.1 * index} direction="up">
                            <FAQItem
                                question={faq.question}
                                answer={faq.answer}
                                isOpen={openIndex === index}
                                onClick={() => handleToggle(index)}
                            />
                        </ScrollReveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FAQ;
