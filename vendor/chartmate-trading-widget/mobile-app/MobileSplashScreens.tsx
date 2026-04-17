import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, TrendingUp, Bot, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const slides = [
  {
    icon: TrendingUp,
    title: "Market Predictor AI",
    description: "Get real-time trading insights and advanced analytics natively on your mobile."
  },
  {
    icon: Bot,
    title: "AI-Powered Analysis",
    description: "Leverage cutting-edge AI to predict market movements and stay ahead of the curve."
  },
  {
    icon: ShieldCheck,
    title: "Trade Smarter",
    description: "Secure, reliable, and lightning fast. Take complete control of your portfolio."
  }
];

export function MobileSplashScreens() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      localStorage.setItem('hasSeenMobileSplash', 'true');
      navigate('/', { replace: true });
    }
  };

  const handleSkip = () => {
    localStorage.setItem('hasSeenMobileSplash', 'true');
    navigate('/', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground pb-safe pt-safe">
      <div className="flex justify-end p-4">
        {currentSlide < slides.length - 1 && (
          <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
            Skip
          </Button>
        )}
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center -mt-10 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center px-6 absolute"
          >
            <div className="bg-primary/20 p-6 rounded-full mb-8 shadow-[0_0_40px_rgba(var(--primary),0.3)]">
              {React.createElement(slides[currentSlide].icon, {
                className: "w-16 h-16 text-primary"
              })}
            </div>
            <h2 className="text-3xl font-bold mb-4 tracking-tight">
              {slides[currentSlide].title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-sm">
              {slides[currentSlide].description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-8 flex flex-col items-center">
        <div className="flex space-x-2 mb-8">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentSlide ? 'w-8 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]' : 'w-2 bg-primary/20'
              }`}
            />
          ))}
        </div>
        
        <Button 
          size="lg" 
          className="w-full rounded-full h-14 text-lg font-medium shadow-lg hover:shadow-primary/50 transition-shadow" 
          onClick={handleNext}
        >
          {currentSlide === slides.length - 1 ? "Get Started" : "Next"}
          <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
