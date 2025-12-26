import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBox from '@/components/SearchBox';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

describe('SearchBox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  describe('Rendering', () => {
    it('renders the search input with default placeholder', () => {
      render(<SearchBox />);
      const input = screen.getByPlaceholderText(/Ask anything/i);
      expect(input).toBeInTheDocument();
    });

    it('renders with custom placeholder', () => {
      render(<SearchBox placeholder="Custom placeholder" />);
      const input = screen.getByPlaceholderText('Custom placeholder');
      expect(input).toBeInTheDocument();
    });

    it('renders with initial value', () => {
      render(<SearchBox initialValue="test query" />);
      const input = screen.getByDisplayValue('test query');
      expect(input).toBeInTheDocument();
    });

    it('renders large variant with different styling', () => {
      const { container } = render(<SearchBox large={true} />);
      expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();
    });

    it('renders toolbar buttons', () => {
      render(<SearchBox large={true} />);
      // Check for toolbar buttons (search, focus, pro, attachment, voice, submit)
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('User Interactions', () => {
    it('updates input value when typing', async () => {
      const user = userEvent.setup();
      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, 'test search');

      expect(input).toHaveValue('test search');
    });

    it('does not submit when query is empty', async () => {
      const user = userEvent.setup();
      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, '{enter}');

      expect(mockPush).not.toHaveBeenCalled();
    });

    it('submits search on Enter key press', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ refinedQuery: 'refined test' }),
      });

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, 'test query');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/refine', expect.any(Object));
      });
    });

    it('handles search failure gracefully', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, 'test query');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        // URLSearchParams encodes spaces as + not %20
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('/search?q=test+query')
        );
      });
    });

    it('shows loading state during search', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: Response) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      (global.fetch as jest.Mock).mockReturnValueOnce(pendingPromise);

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, 'test query');
      await user.keyboard('{Enter}');

      // Check that input is disabled during loading
      await waitFor(() => {
        expect(input).toBeDisabled();
      });

      // Resolve the promise
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ refinedQuery: 'test' }),
      });
    });

    it('trims whitespace from query', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ refinedQuery: 'trimmed query' }),
      });

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, '  test query  ');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/refine',
          expect.objectContaining({
            body: JSON.stringify({ query: 'test query', provider: 'deepseek' }),
          })
        );
      });
    });
  });

  describe('Focus Behavior', () => {
    it('auto-focuses when autoFocus prop is true', () => {
      render(<SearchBox autoFocus={true} />);
      const input = screen.getByPlaceholderText(/Ask anything/i);
      expect(document.activeElement).toBe(input);
    });

    it('does not auto-focus by default', () => {
      render(<SearchBox />);
      const input = screen.getByPlaceholderText(/Ask anything/i);
      expect(document.activeElement).not.toBe(input);
    });
  });
});
