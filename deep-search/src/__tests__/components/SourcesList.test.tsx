import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SourcesList from '@/components/SourcesList';

describe('SourcesList', () => {
  const mockSources = [
    { id: '1', title: 'Source 1', url: 'https://example1.com', iconUrl: '' },
    { id: '2', title: 'Source 2', url: 'https://example2.com', iconUrl: '' },
    { id: '3', title: 'Source 3', url: 'https://example3.com', iconUrl: '' },
    { id: '4', title: 'Source 4', url: 'https://example4.com', iconUrl: '' },
    { id: '5', title: 'Source 5', url: 'https://example5.com', iconUrl: '' },
  ];

  const defaultProps = {
    sources: mockSources,
    onSourceClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the sources count', () => {
      render(<SourcesList {...defaultProps} />);
      expect(screen.getByText('5 sources')).toBeInTheDocument();
    });

    it('renders custom totalSources count when provided', () => {
      render(<SourcesList {...defaultProps} totalSources={10} />);
      expect(screen.getByText('10 sources')).toBeInTheDocument();
    });

    it('renders "View all" button', () => {
      render(<SourcesList {...defaultProps} />);
      expect(screen.getByText('View all')).toBeInTheDocument();
    });

    it('initially shows only 3 sources', () => {
      render(<SourcesList {...defaultProps} />);
      expect(screen.getByText('Source 1')).toBeInTheDocument();
      expect(screen.getByText('Source 2')).toBeInTheDocument();
      expect(screen.getByText('Source 3')).toBeInTheDocument();
      expect(screen.queryByText('Source 4')).not.toBeInTheDocument();
      expect(screen.queryByText('Source 5')).not.toBeInTheDocument();
    });

    it('shows "+X more" button when collapsed', () => {
      render(<SourcesList {...defaultProps} />);
      expect(screen.getByText('+ 2 more')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse', () => {
    it('shows all sources when "View all" is clicked', () => {
      render(<SourcesList {...defaultProps} />);

      fireEvent.click(screen.getByText('View all'));

      // After expanding, all 5 sources should be visible
      expect(screen.getAllByText(/Source \d/).length).toBe(5);
    });

    it('changes button text to "Show less" when expanded', () => {
      render(<SourcesList {...defaultProps} />);

      fireEvent.click(screen.getByText('View all'));

      expect(screen.getByText('Show less')).toBeInTheDocument();
      expect(screen.queryByText('View all')).not.toBeInTheDocument();
    });

    it('collapses back when "Show less" is clicked', () => {
      render(<SourcesList {...defaultProps} />);

      // Expand
      fireEvent.click(screen.getByText('View all'));
      // Collapse
      fireEvent.click(screen.getByText('Show less'));

      expect(screen.queryByText('Source 4')).not.toBeInTheDocument();
      expect(screen.queryByText('Source 5')).not.toBeInTheDocument();
    });

    it('hides "+X more" button when expanded', () => {
      render(<SourcesList {...defaultProps} />);

      fireEvent.click(screen.getByText('View all'));

      expect(screen.queryByText('+ 2 more')).not.toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('calls onSourceClick with source id when source is clicked', () => {
      render(<SourcesList {...defaultProps} />);

      const source1 = screen.getByText('Source 1');
      fireEvent.click(source1.closest('div[class*="cursor-pointer"]')!);

      expect(defaultProps.onSourceClick).toHaveBeenCalledWith('1');
    });

    it('sets clicked source as active', () => {
      const { container } = render(<SourcesList {...defaultProps} />);

      // First source should be active by default
      const sourceItems = container.querySelectorAll('[class*="cursor-pointer"]');
      expect(sourceItems[0]).toHaveClass('bg-neutral-800');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty sources array', () => {
      render(<SourcesList {...defaultProps} sources={[]} />);
      expect(screen.getByText('0 sources')).toBeInTheDocument();
    });

    it('shows all sources without expand button when 3 or fewer', () => {
      const threeSourcesProps = {
        ...defaultProps,
        sources: mockSources.slice(0, 3),
      };
      render(<SourcesList {...threeSourcesProps} />);

      expect(screen.getByText('Source 1')).toBeInTheDocument();
      expect(screen.getByText('Source 2')).toBeInTheDocument();
      expect(screen.getByText('Source 3')).toBeInTheDocument();
      expect(screen.queryByText('+ ')).not.toBeInTheDocument();
    });

    it('handles single source', () => {
      const singleSourceProps = {
        ...defaultProps,
        sources: [mockSources[0]],
      };
      render(<SourcesList {...singleSourceProps} />);

      expect(screen.getByText('1 sources')).toBeInTheDocument();
      expect(screen.getByText('Source 1')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('has correct container styling', () => {
      const { container } = render(<SourcesList {...defaultProps} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('bg-neutral-900');
      expect(wrapper).toHaveClass('rounded-lg');
    });
  });
});
