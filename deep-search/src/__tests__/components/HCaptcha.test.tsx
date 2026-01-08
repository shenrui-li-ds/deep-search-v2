import React from 'react';
import { render, act } from '@testing-library/react';
import HCaptcha from '@/components/HCaptcha';

// Mock window.hcaptcha
const mockRender = jest.fn().mockReturnValue('widget-id-123');
const mockReset = jest.fn();
const mockRemove = jest.fn();

const mockHCaptcha = {
  render: mockRender,
  reset: mockReset,
  remove: mockRemove,
};

describe('HCaptcha', () => {
  const defaultProps = {
    siteKey: 'test-site-key',
    onVerify: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.hcaptcha
    (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = undefined;
    (window as unknown as { onHCaptchaLoad?: () => void }).onHCaptchaLoad = undefined;
    // Clear any script tags from previous tests
    document.head.innerHTML = '';
  });

  describe('Rendering', () => {
    it('renders a container div', () => {
      render(<HCaptcha {...defaultProps} />);
      const container = document.querySelector('.hcaptcha-container');
      expect(container).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<HCaptcha {...defaultProps} className="custom-class" />);
      const container = document.querySelector('.hcaptcha-container');
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('Script Loading', () => {
    it('loads hCaptcha script when not already loaded', () => {
      render(<HCaptcha {...defaultProps} />);

      const script = document.querySelector('script[src*="js.hcaptcha.com"]') as HTMLScriptElement;
      expect(script).toBeInTheDocument();
      expect(script.async).toBe(true);
      expect(script.defer).toBe(true);
    });

    it('does not load script twice', () => {
      const { rerender } = render(<HCaptcha {...defaultProps} />);
      rerender(<HCaptcha {...defaultProps} />);

      const scripts = document.querySelectorAll('script[src*="js.hcaptcha.com"]');
      expect(scripts.length).toBe(1);
    });

    it('sets onHCaptchaLoad callback', () => {
      render(<HCaptcha {...defaultProps} />);
      expect((window as unknown as { onHCaptchaLoad?: () => void }).onHCaptchaLoad).toBeDefined();
    });
  });

  describe('Widget Rendering', () => {
    it('renders widget when hcaptcha is already loaded', () => {
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      render(<HCaptcha {...defaultProps} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          sitekey: 'test-site-key',
        })
      );
    });

    it('passes onVerify callback to widget', () => {
      const onVerify = jest.fn();
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      render(<HCaptcha {...defaultProps} onVerify={onVerify} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          callback: onVerify,
        })
      );
    });

    it('passes onError callback to widget', () => {
      const onError = jest.fn();
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      render(<HCaptcha {...defaultProps} onError={onError} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          'error-callback': onError,
        })
      );
    });

    it('passes onExpire callback to widget', () => {
      const onExpire = jest.fn();
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      render(<HCaptcha {...defaultProps} onExpire={onExpire} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          'expired-callback': onExpire,
        })
      );
    });

    it('uses light theme by default', () => {
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      render(<HCaptcha {...defaultProps} />);

      expect(mockRender).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          theme: 'light',
        })
      );
    });

    it('accepts custom theme', () => {
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      render(<HCaptcha {...defaultProps} theme="dark" />);

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
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      const { unmount } = render(<HCaptcha {...defaultProps} />);
      unmount();

      expect(mockRemove).toHaveBeenCalledWith('widget-id-123');
    });

    it('removes existing widget before rendering new one', () => {
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      const { rerender } = render(<HCaptcha {...defaultProps} siteKey="key-1" />);

      // Simulate re-render with new site key
      mockRender.mockReturnValueOnce('widget-id-456');
      rerender(<HCaptcha {...defaultProps} siteKey="key-2" />);

      expect(mockRemove).toHaveBeenCalledWith('widget-id-123');
    });

    it('handles remove error gracefully', () => {
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;
      mockRemove.mockImplementationOnce(() => {
        throw new Error('Widget already removed');
      });

      const { unmount } = render(<HCaptcha {...defaultProps} />);

      // Should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('onHCaptchaLoad callback', () => {
    it('renders widget when onHCaptchaLoad is called', () => {
      render(<HCaptcha {...defaultProps} />);

      // Simulate hCaptcha script loading
      (window as unknown as { hcaptcha?: typeof mockHCaptcha }).hcaptcha = mockHCaptcha;

      act(() => {
        const callback = (window as unknown as { onHCaptchaLoad?: () => void }).onHCaptchaLoad;
        if (callback) callback();
      });

      expect(mockRender).toHaveBeenCalled();
    });
  });
});
