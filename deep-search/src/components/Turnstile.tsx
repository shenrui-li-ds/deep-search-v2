'use client';

import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: TurnstileOptions
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  appearance?: 'always' | 'execute' | 'interaction-only';
  size?: 'normal' | 'compact';
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

export default function Turnstile({
  siteKey,
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
  className = '',
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;

    // Remove existing widget if any
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // Widget might already be removed
      }
      widgetIdRef.current = null;
    }

    // Clear container
    containerRef.current.innerHTML = '';

    // Render new widget
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      'error-callback': onError,
      'expired-callback': onExpire,
      theme,
      appearance: 'always',
    });
  }, [siteKey, onVerify, onError, onExpire, theme]);

  useEffect(() => {
    // If script already loaded, render immediately
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // If script is loading, wait for it
    if (scriptLoadedRef.current) {
      window.onTurnstileLoad = renderWidget;
      return;
    }

    // Load the Turnstile script
    scriptLoadedRef.current = true;

    window.onTurnstileLoad = renderWidget;

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup widget on unmount
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget might already be removed
        }
      }
    };
  }, [renderWidget]);

  // Reset function exposed via ref pattern
  useEffect(() => {
    // Re-render when siteKey changes (shouldn't happen often)
    if (window.turnstile && containerRef.current) {
      renderWidget();
    }
  }, [siteKey, renderWidget]);

  return (
    <div
      ref={containerRef}
      className={`turnstile-container ${className}`}
    />
  );
}

// Helper function to reset the widget externally
export function useTurnstileReset() {
  const resetRef = useRef<(() => void) | null>(null);

  const setResetFunction = useCallback((fn: () => void) => {
    resetRef.current = fn;
  }, []);

  const reset = useCallback(() => {
    if (resetRef.current) {
      resetRef.current();
    }
  }, []);

  return { setResetFunction, reset };
}
