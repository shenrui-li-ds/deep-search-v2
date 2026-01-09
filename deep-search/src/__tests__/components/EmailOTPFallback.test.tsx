import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailOTPFallback from '@/components/EmailOTPFallback';

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'otp.verified': 'Email verified successfully',
      'otp.sending': 'Sending code...',
      'otp.sendCode': 'Send verification code',
      'otp.codeSentTo': 'Code sent to',
      'otp.expiresIn': `Code expires in ${params?.time || ''}`,
      'otp.resendIn': `Resend in ${params?.time || ''}`,
      'otp.resendCode': 'Resend code',
      'otp.captchaUnavailable': 'Security check unavailable. Verify via email instead.',
      'errors.otpSendFailed': 'Failed to send verification code',
      'errors.otpVerifyFailed': 'Invalid or expired code',
      'errors.networkError': 'Network error. Please try again.',
      'errors.requestTimeout': 'Request timed out. Please try again.',
    };
    return translations[key] || key;
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock AbortController
const mockAbort = jest.fn();
class MockAbortController {
  signal = { aborted: false };
  abort = mockAbort;
}
global.AbortController = MockAbortController as unknown as typeof AbortController;

describe('EmailOTPFallback', () => {
  const defaultProps = {
    email: 'test@example.com',
    purpose: 'login' as const,
    onVerified: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial State', () => {
    it('renders initial state with send code button', () => {
      render(<EmailOTPFallback {...defaultProps} />);

      expect(screen.getByText('Security check unavailable. Verify via email instead.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send verification code/i })).toBeInTheDocument();
    });

    it('disables send button when email is empty', () => {
      render(<EmailOTPFallback {...defaultProps} email="" />);

      const button = screen.getByRole('button', { name: /send verification code/i });
      expect(button).toBeDisabled();
    });

    it('applies custom className', () => {
      const { container } = render(
        <EmailOTPFallback {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Send OTP Flow', () => {
    it('sends OTP request when button is clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      render(<EmailOTPFallback {...defaultProps} />);

      const button = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
      });
    });

    it('shows code input after successful send', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      render(<EmailOTPFallback {...defaultProps} />);

      const button = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText(/code sent to/i)).toBeInTheDocument();
      });

      // Should have 6 input fields for the code
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(6);
    });

    it('shows error when send fails', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Rate limited' }),
      });

      render(<EmailOTPFallback {...defaultProps} />);

      const button = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('Rate limited')).toBeInTheDocument();
      });
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<EmailOTPFallback {...defaultProps} />);

      const button = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Code Input', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });
    });

    it('auto-advances to next input on digit entry', async () => {
      render(<EmailOTPFallback {...defaultProps} />);

      // Send code first
      const sendButton = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(screen.getAllByRole('textbox')).toHaveLength(6);
      });

      const inputs = screen.getAllByRole('textbox');

      await act(async () => {
        fireEvent.change(inputs[0], { target: { value: '1' } });
      });

      // Focus should move to second input
      expect(document.activeElement).toBe(inputs[1]);
    });

    it('only allows digit input', async () => {
      render(<EmailOTPFallback {...defaultProps} />);

      const sendButton = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(screen.getAllByRole('textbox')).toHaveLength(6);
      });

      const inputs = screen.getAllByRole('textbox');

      await act(async () => {
        fireEvent.change(inputs[0], { target: { value: 'a' } });
      });

      expect(inputs[0]).toHaveValue('');
    });
  });

  describe('Verify OTP Flow', () => {
    it('auto-submits when all 6 digits are entered', async () => {
      // Send code
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      // Verify code
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, verified_at: new Date().toISOString() }),
      });

      render(<EmailOTPFallback {...defaultProps} />);

      const sendButton = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(screen.getAllByRole('textbox')).toHaveLength(6);
      });

      const inputs = screen.getAllByRole('textbox');

      // Enter all 6 digits
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
        });
      }

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/auth/verify-otp', expect.any(Object));
      });
    });

    it('shows verified state after successful verification', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, verified_at: new Date().toISOString() }),
      });

      const onVerified = jest.fn();
      render(<EmailOTPFallback {...defaultProps} onVerified={onVerified} />);

      const sendButton = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(screen.getAllByRole('textbox')).toHaveLength(6);
      });

      const inputs = screen.getAllByRole('textbox');

      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
        });
      }

      await waitFor(() => {
        expect(screen.getByText('Email verified successfully')).toBeInTheDocument();
      });

      expect(onVerified).toHaveBeenCalled();
    });

    it('clears code and shows error on verification failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Invalid code' }),
      });

      render(<EmailOTPFallback {...defaultProps} />);

      const sendButton = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(screen.getAllByRole('textbox')).toHaveLength(6);
      });

      const inputs = screen.getAllByRole('textbox');

      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
        });
      }

      await waitFor(() => {
        expect(screen.getByText('Invalid code')).toBeInTheDocument();
      });

      // Inputs should be cleared
      inputs.forEach((input) => {
        expect(input).toHaveValue('');
      });
    });
  });

  describe('Purpose Parameter', () => {
    it('sends correct purpose for signup', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      render(<EmailOTPFallback {...defaultProps} purpose="signup" />);

      const button = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', purpose: 'signup' }),
      });
    });

    it('sends correct purpose for reset', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      render(<EmailOTPFallback {...defaultProps} purpose="reset" />);

      const button = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', purpose: 'reset' }),
      });
    });
  });

  describe('Timeout Handling', () => {
    it('shows timeout error when verification request is aborted', async () => {
      // Send code first
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      // Verify request throws AbortError (timeout)
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      render(<EmailOTPFallback {...defaultProps} />);

      // Send the code
      const sendButton = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(screen.getAllByRole('textbox')).toHaveLength(6);
      });

      // Enter all 6 digits to trigger verification
      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
        });
      }

      // Should show timeout error message
      await waitFor(() => {
        expect(screen.getByText('Request timed out. Please try again.')).toBeInTheDocument();
      });

      // Inputs should be cleared for retry
      inputs.forEach((input) => {
        expect(input).toHaveValue('');
      });
    });

    it('passes abort signal to verify fetch', async () => {
      // Send code
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, expires_in: 600 }),
      });

      // Verify code - successful
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, verified_at: new Date().toISOString() }),
      });

      render(<EmailOTPFallback {...defaultProps} />);

      // Send the code
      const sendButton = screen.getByRole('button', { name: /send verification code/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(screen.getAllByRole('textbox')).toHaveLength(6);
      });

      // Enter all 6 digits
      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
        });
      }

      // Verify that fetch was called with signal option
      await waitFor(() => {
        const verifyCall = mockFetch.mock.calls.find(
          (call) => call[0] === '/api/auth/verify-otp'
        );
        expect(verifyCall).toBeDefined();
        expect(verifyCall![1]).toHaveProperty('signal');
      });
    });
  });
});
