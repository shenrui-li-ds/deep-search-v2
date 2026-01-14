'use client';

import React, { useEffect, useState } from 'react';
import {
  GradientOrb,
  Navbar,
  Hero,
  TheDifference,
  ThreeModes,
  ThinkingPanel,
  YourDocuments,
  HowItWorks,
  PoweredBy,
  FinalCTA,
  Footer,
} from '@/components/landing';

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <GradientOrb className="w-[600px] h-[600px] -top-48 -left-48 bg-cyan-500/40" />
        <GradientOrb className="w-[500px] h-[500px] top-1/3 -right-24 bg-purple-500/30" />
        <GradientOrb className="w-[400px] h-[400px] bottom-0 left-1/3 bg-blue-500/20" />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '64px 64px'
          }}
        />
      </div>

      {/* Navigation */}
      <Navbar scrollY={scrollY} />

      {/* Page Sections */}
      <Hero />
      <TheDifference />
      <ThreeModes />
      <ThinkingPanel />
      <YourDocuments />
      <HowItWorks />
      <PoweredBy />
      <FinalCTA />
      <Footer />
    </div>
  );
}
