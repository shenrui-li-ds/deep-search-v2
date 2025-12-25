import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SourceItem from '@/components/SourceItem';

describe('SourceItem', () => {
  const defaultProps = {
    title: 'Test Article Title',
    url: 'https://example.com/article',
    iconUrl: 'https://example.com/icon.png',
    onClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the title', () => {
      render(<SourceItem {...defaultProps} />);
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    });

    it('renders with icon when iconUrl is provided', () => {
      render(<SourceItem {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/icon.png');
    });

    it('renders fallback initial when iconUrl is empty', () => {
      render(<SourceItem {...defaultProps} iconUrl="" />);
      // Should show first letter of domain capitalized
      expect(screen.getByText('E')).toBeInTheDocument();
    });

    it('renders author when provided', () => {
      render(<SourceItem {...defaultProps} author="John Doe" />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('renders timeAgo when provided', () => {
      render(<SourceItem {...defaultProps} timeAgo="2 hours ago" />);
      expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    });

    it('renders readTime when provided', () => {
      render(<SourceItem {...defaultProps} readTime="5 min" />);
      expect(screen.getByText('5 min read')).toBeInTheDocument();
    });

    it('renders all metadata together', () => {
      render(
        <SourceItem
          {...defaultProps}
          author="Jane Smith"
          timeAgo="1 day ago"
          readTime="3 min"
        />
      );
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('1 day ago')).toBeInTheDocument();
      expect(screen.getByText('3 min read')).toBeInTheDocument();
    });
  });

  describe('URL Parsing', () => {
    it('extracts domain from valid URL', () => {
      render(<SourceItem {...defaultProps} iconUrl="" url="https://www.example.com/path" />);
      // First letter of domain (without www)
      expect(screen.getByText('E')).toBeInTheDocument();
    });

    it('handles URL without www', () => {
      render(<SourceItem {...defaultProps} iconUrl="" url="https://test.org/article" />);
      expect(screen.getByText('T')).toBeInTheDocument();
    });

    it('handles invalid URL gracefully', () => {
      render(<SourceItem {...defaultProps} iconUrl="" url="invalid-url" />);
      // Should use first character of the URL string
      expect(screen.getByText('I')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('calls onClick when clicked', () => {
      render(<SourceItem {...defaultProps} />);
      const item = screen.getByText('Test Article Title').closest('div[class*="cursor-pointer"]');
      fireEvent.click(item!);
      expect(defaultProps.onClick).toHaveBeenCalledTimes(1);
    });

    it('has cursor pointer style', () => {
      const { container } = render(<SourceItem {...defaultProps} />);
      const clickableDiv = container.querySelector('.cursor-pointer');
      expect(clickableDiv).toBeInTheDocument();
    });
  });

  describe('Active State', () => {
    it('applies active styling when isActive is true', () => {
      const { container } = render(<SourceItem {...defaultProps} isActive={true} />);
      const item = container.firstChild as HTMLElement;
      expect(item).toHaveClass('bg-neutral-800');
    });

    it('applies hover styling when not active', () => {
      const { container } = render(<SourceItem {...defaultProps} isActive={false} />);
      const item = container.firstChild as HTMLElement;
      expect(item).toHaveClass('hover:bg-neutral-800');
    });

    it('defaults to not active', () => {
      const { container } = render(<SourceItem {...defaultProps} />);
      const item = container.firstChild as HTMLElement;
      expect(item).not.toHaveClass('bg-neutral-800');
    });
  });

  describe('Icon Display', () => {
    it('renders image with correct alt text', () => {
      render(<SourceItem {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'example.com icon');
    });

    it('image has correct dimensions', () => {
      render(<SourceItem {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('width', '24');
      expect(img).toHaveAttribute('height', '24');
    });
  });
});
