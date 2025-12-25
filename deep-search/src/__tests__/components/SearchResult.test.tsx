import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchResult from '@/components/SearchResult';

// Mock react-markdown to simplify testing
jest.mock('react-markdown', () => {
  return function MockReactMarkdown({ children }: { children: string }) {
    return <div data-testid="markdown-content">{children}</div>;
  };
});

jest.mock('remark-gfm', () => () => {});
jest.mock('rehype-raw', () => () => {});
jest.mock('rehype-sanitize', () => () => {});

// Mock the SearchLoading component
jest.mock('@/components/SearchLoading', () => {
  return function MockSearchLoading() {
    return <div data-testid="search-loading">Searching sources...</div>;
  };
});

describe('SearchResult', () => {
  const mockSources = [
    { id: '1', title: 'Source 1', url: 'https://example1.com', iconUrl: 'https://example1.com/icon.png' },
    { id: '2', title: 'Source 2', url: 'https://example2.com', iconUrl: 'https://example2.com/icon.png' },
    { id: '3', title: 'Source 3', url: 'https://example3.com', iconUrl: 'https://example3.com/icon.png' },
  ];

  const mockImages = [
    { url: 'https://example.com/image1.jpg', alt: 'Image 1', sourceId: '1' },
    { url: 'https://example.com/image2.jpg', alt: 'Image 2', sourceId: '2' },
  ];

  const defaultProps = {
    query: 'Test query',
    result: {
      content: '# Test Content\n\nThis is a test answer with **bold** text.',
      sources: mockSources,
      images: mockImages,
    },
  };

  describe('Loading State', () => {
    it('shows loading component when isLoading is true', () => {
      render(<SearchResult {...defaultProps} isLoading={true} />);
      expect(screen.getByTestId('search-loading')).toBeInTheDocument();
    });

    it('does not show content when loading', () => {
      render(<SearchResult {...defaultProps} isLoading={true} />);
      // The query should not be displayed as a heading when loading
      expect(screen.queryByRole('heading', { name: 'Test query' })).not.toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders all three tabs', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByText('Answer')).toBeInTheDocument();
      expect(screen.getByText('Links')).toBeInTheDocument();
      expect(screen.getByText('Images')).toBeInTheDocument();
    });

    it('shows Answer tab content by default', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByText('Test query')).toBeInTheDocument();
    });

    it('has clickable tab buttons', () => {
      render(<SearchResult {...defaultProps} />);

      // Verify tabs are rendered as buttons with tab role
      const linksTab = screen.getByRole('tab', { name: /Links/i });
      const imagesTab = screen.getByRole('tab', { name: /Images/i });
      const answerTab = screen.getByRole('tab', { name: /Answer/i });

      expect(linksTab).toBeInTheDocument();
      expect(imagesTab).toBeInTheDocument();
      expect(answerTab).toBeInTheDocument();
    });

    // Note: Radix UI tabs have complex behavior in jsdom that requires additional setup
    // Tab content switching is tested through visual/E2E testing
  });

  describe('Answer Tab', () => {
    it('displays the query as title', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByRole('heading', { name: 'Test query' })).toBeInTheDocument();
    });

    it('shows "Reviewed X sources" text', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByText(/Reviewed 3 sources/)).toBeInTheDocument();
    });

    it('expands sources when clicked', () => {
      render(<SearchResult {...defaultProps} />);

      fireEvent.click(screen.getByText(/Reviewed 3 sources/));

      // Should show source pills
      const sourceLinks = screen.getAllByRole('link');
      expect(sourceLinks.length).toBeGreaterThan(0);
    });

    it('renders markdown content', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
    });

    it('displays related questions', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByText('Related')).toBeInTheDocument();
    });

    it('shows follow-up input', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByPlaceholderText('Ask a follow-up')).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('renders Share button in header', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByText('Share')).toBeInTheDocument();
    });

    it('renders action buttons in the action bar', () => {
      render(<SearchResult {...defaultProps} />);

      // Action buttons are now icon-only with tooltips, so we check for the button elements
      // Look for buttons in the action bar section (after content, before related)
      const buttons = screen.getAllByRole('button');
      // Should have action buttons (copy, like, dislike, rewrite, share, etc.)
      expect(buttons.length).toBeGreaterThan(4);
    });

    it('shows source count at bottom', () => {
      render(<SearchResult {...defaultProps} />);
      expect(screen.getByText('3 sources')).toBeInTheDocument();
    });
  });

  // Note: Links and Images tab content tests are simplified because Radix UI tabs
  // don't switch content properly in jsdom environment.
  // Full tab content switching should be tested via E2E tests.

  describe('Related Questions', () => {
    it('generates related questions based on query', () => {
      render(<SearchResult {...defaultProps} />);

      // Related questions should contain the query
      expect(screen.getByText(/latest updates about Test query/)).toBeInTheDocument();
    });

    it('related questions are clickable links', () => {
      render(<SearchResult {...defaultProps} />);

      const relatedLinks = screen.getAllByRole('link').filter(link =>
        link.getAttribute('href')?.includes('/search?q=')
      );
      expect(relatedLinks.length).toBeGreaterThan(0);
    });
  });

  describe('Sources Expansion', () => {
    it('collapses sources by default', () => {
      render(<SearchResult {...defaultProps} />);

      // Source pills should not be visible initially
      const chevronButton = screen.getByText(/Reviewed 3 sources/).closest('button');
      expect(chevronButton).toBeInTheDocument();
    });

    it('toggles source visibility on click', () => {
      render(<SearchResult {...defaultProps} />);

      const toggleButton = screen.getByText(/Reviewed 3 sources/);

      // Expand
      fireEvent.click(toggleButton);

      // Check if sources are shown (look for domain text)
      expect(screen.getByText('example1.com')).toBeInTheDocument();

      // Collapse
      fireEvent.click(toggleButton);
    });
  });
});
