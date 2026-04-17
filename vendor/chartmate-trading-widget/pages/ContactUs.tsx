import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import Layout from "../components/landingpage/Layout";
import { useForm, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSessionAffiliateAttribution } from "@/hooks/useAffiliateRef";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollReveal } from "../components/ui/ScrollReveal";
import { PRICING_PLANS } from "@/constants/pricing";
import { CheckCircle2 } from "lucide-react";

interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
  plan: string;
  referral_code: string;
}

const ContactUsPage = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
      plan: "",
      referral_code: "",
    },
  });

  const handleFormSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      const planNames: Record<string, string> = {
        starterPlan: "Starter Plan - $49/mo",
        growthPlan: "Growth Plan - $79/mo",
        professionalPlan: "Pro Plan - $129/mo",
      };

      const emailBody = `Name : ${data.name}\nEmail : ${data.email}\nPhone : ${data.phone}\nInterested Plan : ${planNames[data.plan] || data.plan}\nMessage : \n ${data.message || ""}`;

      const { affiliateId } = getSessionAffiliateAttribution();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types
      await (supabase as any)
        .from("contact_submissions")
        .insert([
          {
            name: data.name,
            email: data.email,
            phone: data.phone,
            description: `Plan: ${planNames[data.plan] || data.plan}\n${data.message || ""}`,
            ...(affiliateId && { affiliate_id: affiliateId }),
            ...(data.referral_code?.trim() && {
              referral_code: data.referral_code.trim(),
            }),
          },
        ])
        .then(() => { })
        .catch(() => { });

      const response = await fetch(
        "https://send-mail-redirect-boostmysites.vercel.app/send-email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: emailBody,
            name: "Tradingsmart.AI",
            subject: `New Enquiry from ${data.name} - ${planNames[data.plan] || data.plan}`,
            to: "partnerships@tradingsmart.ai",
          }),
        },
      );

      if (response.ok) {
        reset();
        setIsSubmitSuccess(true);
        toast.success("Enquiry submitted successfully!");
      } else {
        toast.error("Failed to submit form. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("An error occurred. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hero Background Animation States (Keeping the original animations from ContactUs)
  const [squares, setSquares] = useState<{ top: number; left: number }[]>([]);
  const [drops, setDrops] = useState<
    { id: number; key: number; left: number; duration: number; delay: number }[]
  >([]);

  useEffect(() => {
    const getUniqueLeft = () => {
      return Math.floor(Math.random() * 20) * 80;
    };

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
          delay,
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

    setDrops((prevDrops) =>
      prevDrops.map((drop) => {
        if (drop.id === dropId) {
          const left = getUniqueLeft();
          const duration = 2 + Math.random() * 2;
          const delay = Math.random() * 2;
          return {
            ...drop,
            key: drop.key + 1,
            left,
            duration,
            delay,
          };
        }
        return drop;
      }),
    );
  };

  return (
    <Layout>
      <Helmet>
        <title>Contact TradingSmart.ai</title>
        <meta
          name="description"
          content="Reach the team for platform questions, custom algo integration, white-label, or partnerships. Technology platform—not investment advice."
        />
      </Helmet>
      <section className="relative min-h-screen flex items-center justify-center pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-black">
        {/* Overlay Gradients for Depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black z-0 pointer-events-none"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-black/60 to-black z-0 pointer-events-none"></div>

        {/* Background Animation Canvas */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
              `,
            backgroundSize: "80px 80px",
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
                left: `${pos.left}px`,
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
                top: "-150px",
                animationDuration: `${drop.duration}s`,
                animationDelay: `${drop.delay}s`,
              }}
              onAnimationEnd={() => handleDropAnimationEnd(drop.id)}
            ></div>
          ))}
        </div>

        <div className="container relative z-20 max-w-4xl mx-auto px-4">
          <ScrollReveal delay={0.2}>
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter text-white mb-6 font-syne capitalize">
                Contact <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-teal-500 to-sky-500">Us</span>
              </h1>
              <p className="text-lg md:text-xl text-zinc-400 font-light max-w-2xl mx-auto font-dm-sans">
                Fill out the form below and our team will get back to you within 24 hours to help you automate your trading strategy.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.4}>
            <div className="bg-white/[0.03] backdrop-blur-xl p-8 md:p-14 rounded-[2.5rem] border border-white/[0.06] border-t-teal-500/40 border-t shadow-2xl relative">
              {isSubmitSuccess ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-teal-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-teal-500/20">
                    <CheckCircle2 className="w-10 h-10 text-teal-500" />
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-4 font-syne">
                    Registration Sent!
                  </h3>
                  <p className="text-zinc-400 max-w-sm mx-auto mb-10 text-lg">
                    Thank you for your interest. Our partnership team will review
                    your request and reach out via email within 24 hours.
                  </p>
                  <Button
                    onClick={() => setIsSubmitSuccess(false)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 h-14 rounded-xl font-bold text-lg"
                  >
                    Send Another message
                  </Button>
                </div>
              ) : (
                <form
                  className="space-y-6"
                  onSubmit={handleSubmit(handleFormSubmit)}
                >
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-left">
                      <Label htmlFor="name" className="text-zinc-300 font-medium">
                        Full Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="name"
                        type="text"
                        placeholder="John Doe"
                        {...register("name", {
                          required: "Full name is required",
                        })}
                        className={`h-14 bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all rounded-xl ${errors.name ? "border-red-500" : ""}`}
                      />
                      {errors.name && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.name.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 text-left">
                      <Label
                        htmlFor="email"
                        className="text-zinc-300 font-medium"
                      >
                        Email Address <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        {...register("email", {
                          required: "Email is required",
                          pattern: {
                            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                            message: "Invalid email address",
                          },
                        })}
                        className={`h-14 bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all rounded-xl ${errors.email ? "border-red-500" : ""}`}
                      />
                      {errors.email && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.email.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-left">
                      <Label
                        htmlFor="phone"
                        className="text-zinc-300 font-medium"
                      >
                        Phone Number <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+1 234 567 8900"
                        {...register("phone", {
                          required: "Phone number is required",
                          pattern: {
                            value: /^\+?[0-9\s-]+$/,
                            message: "Please enter a valid phone number",
                          },
                        })}
                        className={`h-14 bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all rounded-xl ${errors.phone ? "border-red-500" : ""}`}
                      />
                      {errors.phone && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.phone.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 text-left">
                      <Label htmlFor="plan" className="text-zinc-300 font-medium">
                        Interested Plan <span className="text-red-500">*</span>
                      </Label>
                      <Controller
                        name="plan"
                        control={control}
                        rules={{ required: "Please select a plan" }}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              className={`h-14 bg-black border-zinc-800 text-white focus:border-teal-500 focus:ring-teal-500/20 rounded-xl ${errors.plan ? "border-red-500" : ""}`}
                            >
                              <SelectValue placeholder="Select a plan/option" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                              {PRICING_PLANS.map((plan) => (
                                <SelectItem
                                  key={plan.id}
                                  value={plan.id}
                                  className="focus:bg-teal-500/20 focus:text-teal-400"
                                >
                                  {plan.name} - ${plan.price}/mo
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.plan && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.plan.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-left">
                    <Label
                      htmlFor="message"
                      className="text-zinc-300 font-medium"
                    >
                      Message <span className="text-red-500">*</span>
                      <span className="ml-2 text-[10px] text-zinc-500 font-normal">
                        (Max 20 words)
                      </span>
                    </Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us about your strategy or requirements..."
                      rows={6}
                      {...register("message", {
                        required: "Message is required",
                        validate: (value) => {
                          const words = value.trim().split(/\s+/).filter(w => w.length > 0);
                          return words.length <= 20 || `Maximum 20 words allowed (current: ${words.length})`;
                        }
                      })}
                      className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all resize-none rounded-xl py-4 ${errors.message ? "border-red-500" : ""}`}
                    />
                    {errors.message && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.message.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 text-left">
                    <Label
                      htmlFor="referral_code"
                      className="text-zinc-300 font-medium"
                    >
                      Referral Code
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        (Optional)
                      </span>
                    </Label>
                    <Input
                      id="referral_code"
                      type="text"
                      placeholder="e.g. john2024"
                      {...register("referral_code")}
                      className="h-14 bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 rounded-xl"
                    />
                  </div>

                  <div className="pt-4">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-teal-500 hover:bg-teal-400 text-black font-bold h-16 rounded-xl shadow-[0_0_30px_rgba(20,184,166,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xl"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Enquiry"}
                    </Button>
                    <p className="text-center text-zinc-500 text-xs mt-4 font-dm-sans">
                      Our experts will analyze your request and reply within 24 hours.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>
    </Layout>
  );
};

export default ContactUsPage;
