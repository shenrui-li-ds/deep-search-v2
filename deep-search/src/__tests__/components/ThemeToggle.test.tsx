import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from '@/components/ThemeToggle';
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

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorageMock.clear();
    document.documentElement.classList.remove('light', 'dark');
  });

  describe('Rendering', () => {
    it('renders the toggle button', () => {
      renderWithThemeProvider(<ThemeToggle />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has correct aria-label for light mode', () => {
      localStorageMock.setItem('theme', 'light');
      renderWithThemeProvider(<ThemeToggle />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to dark mode');
    });

    it('has correct aria-label for dark mode', () => {
      localStorageMock.setItem('theme', 'dark');
      renderWithThemeProvider(<ThemeToggle />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to light mode');
    });

    it('renders moon icon in light mode', () => {
      localStorageMock.setItem('theme', 'light');
      renderWithThemeProvider(<ThemeToggle />);
      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).toBeInTheDocument();
    });

    it('renders sun icon in dark mode', () => {
      localStorageMock.setItem('theme', 'dark');
      renderWithThemeProvider(<ThemeToggle />);
      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Theme Toggle Functionality', () => {
    it('toggles theme from light to dark when clicked', () => {
      localStorageMock.setItem('theme', 'light');
      renderWithThemeProvider(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(localStorageMock.getItem('theme')).toBe('dark');
    });

    it('toggles theme from dark to light when clicked', () => {
      localStorageMock.setItem('theme', 'dark');
      renderWithThemeProvider(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(localStorageMock.getItem('theme')).toBe('light');
    });

    it('updates document class when toggling', () => {
      localStorageMock.setItem('theme', 'light');
      renderWithThemeProvider(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('Styling', () => {
    it('applies custom className', () => {
      renderWithThemeProvider(<ThemeToggle className="custom-class" />);
      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('has base styling classes', () => {
      renderWithThemeProvider(<ThemeToggle />);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('p-2');
      expect(button).toHaveClass('rounded-lg');
      expect(button).toHaveClass('transition-colors');
    });
  });
});
