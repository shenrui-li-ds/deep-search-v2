"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import MainLayout from '../components/MainLayout';
import SearchBox from '../components/SearchBox';
import MobileSidebar from '../components/MobileSidebar';
import { getUserPreferences } from '@/lib/supabase/database';

type ModelProvider = 'openai' | 'deepseek' | 'grok' | 'claude' | 'gemini' | 'vercel-gateway';
type SearchMode = 'web' | 'pro' | 'brainstorm';

export default function Home() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<ModelProvider>('deepseek');
  const [defaultMode, setDefaultMode] = useState<SearchMode>('web');

  // Load user preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getUserPreferences();
        if (prefs) {
          setDefaultProvider(prefs.default_provider);
          setDefaultMode(prefs.default_mode);
        }
      } catch (error) {
        // Silently fail - use defaults if preferences can't be loaded
        console.error('Failed to load preferences:', error);
      }
    };
    loadPreferences();
  }, []);

  return (
    <>
      {/* Mobile hamburger button - floating in corner */}
      <button
        onClick={() => setIsMobileSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--card-hover)] transition-colors"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      <MainLayout hideHeader={true}>
        <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--background)] px-4">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <Image
              src="/owl_google.svg"
              alt="Athenius"
              width={48}
              height={48}
              className="w-12 h-12"
            />
            <h1 className="text-4xl md:text-5xl font-medium text-[var(--text-secondary)] tracking-tight" style={{ fontFamily: '"Atkinson Hyperlegible Mono", monospace' }}>
              Athenius
            </h1>
          </div>

          {/* Search Box with Quick Actions */}
          <div className="w-full max-w-2xl">
            <SearchBox
              large={true}
              autoFocus={true}
              defaultProvider={defaultProvider}
              defaultMode={defaultMode}
            />
          </div>
        </div>
      </MainLayout>
    </>
  );
}
