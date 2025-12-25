import Image from 'next/image';
import MainLayout from '../components/MainLayout';
import SearchBox from '../components/SearchBox';

const quickActions = [
  { icon: '⚖️', label: 'Compare', query: 'compare' },
  { icon: '❤️', label: 'Health', query: 'health' },
  { icon: '✓', label: 'Fact Check', query: 'fact check' },
  { icon: '📚', label: 'Deep Search 101', query: 'how to use deep search' },
  { icon: '📊', label: 'Analyze', query: 'analyze' },
];

export default function Home() {
  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--background)] px-4">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/owl_google.svg"
            alt="Deep Search"
            width={48}
            height={48}
            className="w-12 h-12"
          />
          <h1 className="text-4xl md:text-5xl font-semibold text-[var(--text-primary)] tracking-tight">
            Deep Search
          </h1>
        </div>

        {/* Search Box */}
        <div className="w-full max-w-2xl mb-6">
          <SearchBox large={true} autoFocus={true} />
        </div>

        {/* Quick Action Tags */}
        <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={`/search?q=${encodeURIComponent(action.query)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-full text-sm text-[var(--text-secondary)] hover:bg-[var(--card)] hover:border-[var(--accent)] transition-colors"
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </a>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
