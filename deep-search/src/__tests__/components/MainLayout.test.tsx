import React from 'react';
import { render, screen } from '@testing-library/react';
import MainLayout from '@/components/MainLayout';
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

describe('MainLayout', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('Rendering', () => {
    it('renders children correctly', () => {
      renderWithThemeProvider(
        <MainLayout>
          <div data-testid="child-content">Test Content</div>
        </MainLayout>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('renders the Sidebar component', () => {
      renderWithThemeProvider(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      // Sidebar should render navigation items with text labels
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('renders main content area', () => {
      const { container } = renderWithThemeProvider(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();
    });
  });

  describe('Layout Structure', () => {
    it('has minimum full screen height', () => {
      const { container } = renderWithThemeProvider(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('min-h-screen');
    });

    it('main content area has left margin for sidebar', () => {
      const { container } = renderWithThemeProvider(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      const main = container.querySelector('main');
      expect(main).toHaveClass('ml-[72px]');
    });

    it('main content area has full screen height', () => {
      const { container } = renderWithThemeProvider(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      const main = container.querySelector('main');
      expect(main).toHaveClass('min-h-screen');
    });
  });

  describe('Multiple Children', () => {
    it('renders multiple children correctly', () => {
      renderWithThemeProvider(
        <MainLayout>
          <header data-testid="header">Header</header>
          <section data-testid="section">Section</section>
          <footer data-testid="footer">Footer</footer>
        </MainLayout>
      );

      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('section')).toBeInTheDocument();
      expect(screen.getByTestId('footer')).toBeInTheDocument();
    });
  });
});
