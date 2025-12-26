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

    it('renders navigation links', () => {
      renderWithThemeProvider(<Sidebar />);

      const homeLink = screen.getByTitle('Home');
      const discoverLink = screen.getByTitle('Discover');
      const spacesLink = screen.getByTitle('Spaces');
      const libraryLink = screen.getByTitle('Library');

      expect(homeLink).toBeInTheDocument();
      expect(discoverLink).toBeInTheDocument();
      expect(spacesLink).toBeInTheDocument();
      expect(libraryLink).toBeInTheDocument();
    });

    it('renders account button', () => {
      renderWithThemeProvider(<Sidebar />);
      const accountButton = screen.getByTitle('Account');
      expect(accountButton).toBeInTheDocument();
    });

    it('has correct link destinations', () => {
      renderWithThemeProvider(<Sidebar />);

      expect(screen.getByTitle('Home').closest('a')).toHaveAttribute('href', '/');
      expect(screen.getByTitle('Discover').closest('a')).toHaveAttribute('href', '/discover');
      expect(screen.getByTitle('Spaces').closest('a')).toHaveAttribute('href', '/spaces');
      expect(screen.getByTitle('Library').closest('a')).toHaveAttribute('href', '/library');
    });

    it('renders theme toggle button', () => {
      renderWithThemeProvider(<Sidebar />);
      // Theme toggle should have aria-label
      const themeToggle = screen.getByLabelText(/switch to (dark|light) mode/i);
      expect(themeToggle).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('has border on the right side', () => {
      const { container } = renderWithThemeProvider(<Sidebar />);
      const sidebar = container.firstChild as HTMLElement;
      expect(sidebar).toHaveClass('border-r');
    });

    it('has correct width', () => {
      const { container } = renderWithThemeProvider(<Sidebar />);
      const sidebar = container.firstChild as HTMLElement;
      expect(sidebar).toHaveClass('w-16');
    });
  });

  describe('Accessibility', () => {
    it('navigation links have title attributes for accessibility', () => {
      renderWithThemeProvider(<Sidebar />);

      const navLinks = ['Home', 'Discover', 'Spaces', 'Library'];
      navLinks.forEach(title => {
        expect(screen.getByTitle(title)).toBeInTheDocument();
      });
    });

    it('buttons have title attributes for accessibility', () => {
      renderWithThemeProvider(<Sidebar />);
      expect(screen.getByTitle('Account')).toBeInTheDocument();
    });
  });
});
