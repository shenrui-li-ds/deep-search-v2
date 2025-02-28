import MainLayout from '../components/MainLayout';
import SearchBox from '../components/SearchBox';
import Image from 'next/image';

export default function Home() {
  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="max-w-2xl w-full text-center mb-12">
          <h1 className="text-4xl font-bold mb-6">What do you want to know?</h1>
          <SearchBox large={true} />
          
          <div className="mt-4">
            <a href="/search?q=amazon%20quantum%20chip" className="bg-neutral-700 text-sm rounded-md px-3 py-1 text-white hover:bg-neutral-600 transition-colors">
              View Search Demo
            </a>
          </div>
        </div>
        
        <div className="w-full max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-neutral-800 rounded-lg p-4 hover:bg-neutral-800 transition-colors">
              <h3 className="text-white font-medium mb-2">Quill 3 has 'Unhinged' Article Mode</h3>
              <p className="text-sm text-neutral-400">Quill's new AI capabilities enable it to write in any style.</p>
            </div>
            
            <div className="border border-neutral-800 rounded-lg p-4 hover:bg-neutral-800 transition-colors">
              <h3 className="text-white font-medium mb-2">Amazon Debuts Quantum Chip</h3>
              <p className="text-sm text-neutral-400">Amazon's Ocelet quantum chip uses 'cat qubits' for error correction.</p>
            </div>
            
            <div className="border border-neutral-800 rounded-lg p-4 hover:bg-neutral-800 transition-colors">
              <h3 className="text-white font-medium mb-2">TESLA Stock Analysis</h3>
              <p className="text-sm text-neutral-400">Tesla's latest performance and market predictions.</p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
