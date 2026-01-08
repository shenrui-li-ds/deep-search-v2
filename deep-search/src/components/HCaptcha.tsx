'use client';

import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: HTMLElement,
        options: HCaptchaOptions
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onHCaptchaLoad?: () => void;
  }
}

interface HCaptchaOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact' | 'invisible';
}

interface HCaptchaProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark';
  className?: string;
}

export default function HCaptcha({
  siteKey,
  onVerify,
  onError,
  onExpire,
  theme = 'light',
  className = '',
}: HCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.hcaptcha) return;

    // Remove existing widget if any
    if (widgetIdRef.current) {
      try {
        window.hcaptcha.remove(widgetIdRef.current);
      } catch {
        // Widget might already be removed
      }
      widgetIdRef.current = null;
    }

    // Clear container
    containerRef.current.innerHTML = '';

    // Render new widget
    widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      'error-callback': onError,
      'expired-callback': onExpire,
      theme,
    });
  }, [siteKey, onVerify, onError, onExpire, theme]);

  useEffect(() => {
    // If script already loaded, render immediately
    if (window.hcaptcha) {
      renderWidget();
      return;
    }

    // If script is loading, wait for it
    if (scriptLoadedRef.current) {
      window.onHCaptchaLoad = renderWidget;
      return;
    }

    // Load the hCaptcha script
    scriptLoadedRef.current = true;

    window.onHCaptchaLoad = renderWidget;

    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=onHCaptchaLoad&render=explicit';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup widget on unmount
      if (widgetIdRef.current && window.hcaptcha) {
        try {
          window.hcaptcha.remove(widgetIdRef.current);
        } catch {
          // Widget might already be removed
        }
      }
    };
  }, [renderWidget]);

  // Re-render when siteKey changes (shouldn't happen often)
  useEffect(() => {
    if (window.hcaptcha && containerRef.current) {
      renderWidget();
    }
  }, [siteKey, renderWidget]);

  return (
    <div
      ref={containerRef}
      className={`hcaptcha-container ${className}`}
    />
  );
}
