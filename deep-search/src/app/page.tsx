import Image from 'next/image';
import MainLayout from '../components/MainLayout';
import SearchBox from '../components/SearchBox';

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
          <h1 className="text-4xl md:text-5xl font-medium text-[var(--foreground)] tracking-tight" style={{ fontFamily: 'var(--font-lora)' }}>
            Deep Search
          </h1>
        </div>

        {/* Search Box with Quick Actions */}
        <div className="w-full max-w-2xl">
          <SearchBox large={true} autoFocus={true} />
        </div>
      </div>
    </MainLayout>
  );
}
