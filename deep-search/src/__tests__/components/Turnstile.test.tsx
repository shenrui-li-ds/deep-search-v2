import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Turnstile from '@/components/Turnstile';

// Mock window.turnstile
const mockRender = jest.fn().mockReturnValue('widget-id-123');
const mockReset = jest.fn();
const mockRemove = jest.fn();

const mockTurnstile = {
  render: mockRender,
  reset: mockReset,
  remove: mockRemove,
};

describe('Turnstile', () => {
  const defaultProps = {
    siteKey: 'test-site-key',
    onVerify: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.turnstile
    (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = undefined;
    (window as unknown as { onTurnstileLoad?: () => void }).onTurnstileLoad = undefined;
    // Clear any script tags from previous tests
    document.head.innerHTML = '';
  });

  describe('Rendering', () => {
    it('renders a container div', () => {
      render(<Turnstile {...defaultProps} />);
      const container = document.querySelector('.turnstile-container');
      expect(container).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<Turnstile {...defaultProps} className="custom-class" />);
      const container = document.querySelector('.turnstile-container');
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('Script Loading', () => {
    it('loads Turnstile script when not already loaded', () => {
      render(<Turnstile {...defaultProps} />);

      const script = document.querySelector('script[src*="challenges.cloudflare.com"]') as HTMLScriptElement;
      expect(script).toBeInTheDocument();
      expect(script.async).toBe(true);
      expect(script.defer).toBe(true);
    });

    it('does not load script twice', () => {
      const { rerender } = render(<Turnstile {...defaultProps} />);
      rerender(<Turnstile {...defaultProps} />);

      const scripts = document.querySelectorAll('script[src*="challenges.cloudflare.com"]');
      expect(scripts.length).toBe(1);
    });

    it('sets onTurnstileLoad callback', () => {
      render(<Turnstile {...defaultProps} />);
      expect((window as unknown as { onTurnstileLoad?: () => void }).onTurnstileLoad).toBeDefined();
    });
  });

  describe('Widget Rendering', () => {
    it('renders widget when turnstile is already loaded', () => {
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      render(<Turnstile {...defaultProps} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          sitekey: 'test-site-key',
          appearance: 'always',
        })
      );
    });

    it('passes onVerify callback to widget', () => {
      const onVerify = jest.fn();
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      render(<Turnstile {...defaultProps} onVerify={onVerify} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          callback: onVerify,
        })
      );
    });

    it('passes onError callback to widget', () => {
      const onError = jest.fn();
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      render(<Turnstile {...defaultProps} onError={onError} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          'error-callback': onError,
        })
      );
    });

    it('passes onExpire callback to widget', () => {
      const onExpire = jest.fn();
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      render(<Turnstile {...defaultProps} onExpire={onExpire} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          'expired-callback': onExpire,
        })
      );
    });

    it('uses auto theme by default', () => {
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      render(<Turnstile {...defaultProps} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          theme: 'auto',
        })
      );
    });

    it('accepts custom theme', () => {
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      render(<Turnstile {...defaultProps} theme="dark" />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          theme: 'dark',
        })
      );
    });
  });

  describe('Widget Cleanup', () => {
    it('removes widget on unmount', () => {
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      const { unmount } = render(<Turnstile {...defaultProps} />);
      unmount();

      expect(mockRemove).toHaveBeenCalledWith('widget-id-123');
    });

    it('removes existing widget before rendering new one', () => {
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      const { rerender } = render(<Turnstile {...defaultProps} siteKey="key-1" />);

      // Simulate re-render with new site key
      mockRender.mockReturnValueOnce('widget-id-456');
      rerender(<Turnstile {...defaultProps} siteKey="key-2" />);

      expect(mockRemove).toHaveBeenCalledWith('widget-id-123');
    });

    it('handles remove error gracefully', () => {
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;
      mockRemove.mockImplementationOnce(() => {
        throw new Error('Widget already removed');
      });

      const { unmount } = render(<Turnstile {...defaultProps} />);

      // Should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('onTurnstileLoad callback', () => {
    it('renders widget when onTurnstileLoad is called', () => {
      render(<Turnstile {...defaultProps} />);

      // Simulate Cloudflare script loading
      (window as unknown as { turnstile?: typeof mockTurnstile }).turnstile = mockTurnstile;

      act(() => {
        const callback = (window as unknown as { onTurnstileLoad?: () => void }).onTurnstileLoad;
        if (callback) callback();
      });

      expect(mockRender).toHaveBeenCalled();
    });
  });
});
