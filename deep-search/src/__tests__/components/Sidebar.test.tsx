import React from 'react';
import { render, screen } from '@testing-library/react';
import Sidebar from '@/components/Sidebar';
import { ThemeProvider } from '@/context/ThemeContext';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

const renderWithThemeProvider = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      {component}
    </ThemeProvider>
  );
};

describe('Sidebar', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('Rendering', () => {
    it('renders the sidebar container', () => {
      const { container } = renderWithThemeProvider(<Sidebar />);
      // Sidebar uses h-screen (full height) and fixed positioning
      expect(container.querySelector('.h-screen')).toBeInTheDocument();
    });

    it('renders the logo link to home', () => {
      renderWithThemeProvider(<Sidebar />);
      const homeLinks = screen.getAllByRole('link');
      const logoLink = homeLinks.find(link => link.getAttribute('href') === '/');
      expect(logoLink).toBeInTheDocument();
    });

    it('renders navigation links with text labels', () => {
      renderWithThemeProvider(<Sidebar />);

      // New sidebar uses text labels below icons
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Library')).toBeInTheDocument();
    });

    it('does not render Discover and Spaces (removed)', () => {
      renderWithThemeProvider(<Sidebar />);

      expect(screen.queryByText('Discover')).not.toBeInTheDocument();
      expect(screen.queryByText('Spaces')).not.toBeInTheDocument();
    });

    it('renders New search button', () => {
      renderWithThemeProvider(<Sidebar />);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders account link', () => {
      renderWithThemeProvider(<Sidebar />);
      expect(screen.getByText('Account')).toBeInTheDocument();
    });

    it('has correct link destinations', () => {
      renderWithThemeProvider(<Sidebar />);

      const homeLink = screen.getByText('Home').closest('a');
      const libraryLink = screen.getByText('Library').closest('a');
      const accountLink = screen.getByText('Account').closest('a');

      expect(homeLink).toHaveAttribute('href', '/');
      expect(libraryLink).toHaveAttribute('href', '/library');
      expect(accountLink).toHaveAttribute('href', '/account');
    });

    it('renders theme toggle button', () => {
      renderWithThemeProvider(<Sidebar />);
      // Theme toggle should have aria-label
      const themeToggle = screen.getByLabelText(/switch to (dark|light) mode/i);
      expect(themeToggle).toBeInTheDocument();
    });

    it('renders Theme label below toggle', () => {
      renderWithThemeProvider(<Sidebar />);
      expect(screen.getByText('Theme')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('has border on the right side', () => {
      const { container } = renderWithThemeProvider(<Sidebar />);
      const sidebar = container.firstChild as HTMLElement;
      expect(sidebar).toHaveClass('border-r');
    });

    it('has correct width (72px)', () => {
      const { container } = renderWithThemeProvider(<Sidebar />);
      const sidebar = container.firstChild as HTMLElement;
      expect(sidebar).toHaveClass('w-[72px]');
    });
  });

  describe('Accessibility', () => {
    it('navigation items have visible text labels', () => {
      renderWithThemeProvider(<Sidebar />);

      // Text labels provide accessibility without needing title attributes
      const navLabels = ['Home', 'Library', 'Account', 'Theme'];
      navLabels.forEach(label => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    it('all navigation links are accessible via role', () => {
      renderWithThemeProvider(<Sidebar />);

      const links = screen.getAllByRole('link');
      // Should have: logo, New, Home, Library, Account = 5 links
      expect(links.length).toBeGreaterThanOrEqual(5);
    });
  });
});
