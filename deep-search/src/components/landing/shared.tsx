'use client';

import React from 'react';

// Animated gradient orb component for background effects
export function GradientOrb({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute rounded-full blur-3xl opacity-30 landing-float ${className}`} />
  );
}

// Glassmorphism card component
export function GlassCard({
  children,
  className = '',
  hover = true
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={`
      relative bg-white/[0.03] backdrop-blur-xl
      border border-white/[0.08] rounded-2xl
      ${hover ? 'hover:bg-white/[0.05] hover:border-white/[0.12] hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}

// Feature card for the three modes section
export function ModeCard({
  icon,
  title,
  description,
  gradient,
  delay = 0
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  delay?: number;
}) {
  return (
    <div
      className="opacity-0 landing-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <GlassCard className="p-8 h-full">
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-6 shadow-lg`}>
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
        <p className="text-gray-400 leading-relaxed">{description}</p>
      </GlassCard>
    </div>
  );
}

// Step component for "How it works" section
export function Step({
  number,
  title,
  description,
  isLast = false,
  delay = 0
}: {
  number: number;
  title: string;
  description: string;
  isLast?: boolean;
  delay?: number;
}) {
  return (
    <div
      className="flex items-start gap-6 opacity-0 landing-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/25">
          {number}
        </div>
        {!isLast && (
          <div className="w-px h-20 bg-gradient-to-b from-cyan-500/50 to-transparent mt-4" />
        )}
      </div>
      <div className="pt-2">
        <h4 className="text-lg font-semibold text-white mb-2">{title}</h4>
        <p className="text-gray-400">{description}</p>
      </div>
    </div>
  );
}

// Provider logo component
export function ProviderLogo({ name }: { name: string }) {
  return (
    <div className="px-6 py-3 rounded-lg bg-white/[0.03] border border-white/[0.05] text-gray-500 text-sm font-medium hover:bg-white/[0.06] hover:text-gray-400 transition-all duration-300">
      {name}
    </div>
  );
}

// Document feature item for Docs section
export function DocFeature({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="text-white font-medium mb-1">{title}</h4>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
    </div>
  );
}
