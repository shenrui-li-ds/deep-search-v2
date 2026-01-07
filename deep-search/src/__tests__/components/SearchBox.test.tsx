import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBox from '@/components/SearchBox';

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      search: {
        placeholder: 'Ask anything...',
        placeholderLarge: 'What do you want to know?',
        selectModel: 'Select Model',
        searchMode: 'Search Mode',
        'deepMode.title': 'Deep Research',
        'deepMode.description': 'Multi-round research with gap analysis for comprehensive coverage (8 credits)',
        'modes.web': 'Web Search',
        'modes.pro': 'Research',
        'modes.brainstorm': 'Brainstorm',
        'actions.attachFiles': 'Attach files (coming soon)',
      },
      common: {
        search: 'Search',
      },
      providers: {
        deepseek: 'DeepSeek',
        openai: 'GPT-5.2',
        grok: 'Grok',
        claude: 'Claude Haiku',
        gemini: 'Gemini Flash',
      },
      providerGroups: {
        google: 'Google',
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        xai: 'xAI',
        deepseek: 'DeepSeek',
      },
    };
    const ns = translations[namespace] || {};
    return ns[key] || key;
  },
  useLocale: () => 'en',
}));

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

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, 'test query');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        // SearchBox navigates directly to search page (refine happens there)
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('/search?q=test+query')
        );
      });
    });

    it('navigates to search page with query parameters', async () => {
      const user = userEvent.setup();

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, 'test query');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        // URLSearchParams encodes spaces as + not %20
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('/search?q=test+query')
        );
        // Should also include provider and mode
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('provider=gemini')
        );
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('mode=web')
        );
      });
    });

    it('shows loading state during search', async () => {
      const user = userEvent.setup();

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, 'test query');
      await user.keyboard('{Enter}');

      // Check that input is disabled during loading (briefly before navigation)
      await waitFor(() => {
        expect(input).toBeDisabled();
      });
    });

    it('trims whitespace from query', async () => {
      const user = userEvent.setup();

      render(<SearchBox />);

      const input = screen.getByPlaceholderText(/Ask anything/i);
      await user.type(input, '  test query  ');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        // Query should be trimmed in the URL
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('q=test+query')
        );
        // Should not have leading/trailing spaces encoded
        expect(mockPush).not.toHaveBeenCalledWith(
          expect.stringContaining('q=++test')
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
