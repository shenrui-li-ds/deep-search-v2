import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import MainLayout from '../../components/MainLayout';
import SearchResult from '../../components/SearchResult';
import RelatedQuestions from '../../components/RelatedQuestions';
import RelatedResources from '../../components/RelatedResources';

// Mock data for development purposes
const mockSearchResult = {
  content: `
    <h1 class="text-3xl font-bold mb-4">Amazon Debuts Quantum Chip</h1>
    <p class="mb-4">
      Amazon Web Services (AWS) has unveiled Oceiot, its first quantum computing chip, 
      designed to tackle one of the biggest challenges in the field: error correction. As reported
      by Reuters and CNBC, the prototype chip uses innovative 'cat qubits' to potentially reduce
      error correction costs by up to 90%, marking a significant milestone in the race towards
      practical quantum computing.
    </p>
    <p class="mb-4">
      Quantum computers promise to solve complex problems that traditional computers cannot handle efficiently. 
      However, quantum bits (qubits) are highly susceptible to errors due to their fragile quantum states. 
      This has been a major obstacle in developing practical quantum computers.
    </p>
    <h2 class="text-2xl font-semibold mb-3 mt-6">Cat Qubit Design</h2>
    <p class="mb-4">
      Amazon's Oceiot quantum chip employs a unique approach called 'cat qubits' (named after Schrödinger's cat). 
      Unlike traditional qubits that require complex error correction schemes, cat qubits intrinsically suppress 
      certain types of errors, dramatically reducing the overhead needed for error correction.
    </p>
    <p class="mb-4">
      This design allows Amazon to potentially achieve the same level of computational power with far fewer physical 
      qubits, making quantum computing more efficient and practical for real-world applications.
    </p>
    <h2 class="text-2xl font-semibold mb-3 mt-6">Quantum Race Heating Up</h2>
    <p class="mb-4">
      With this announcement, Amazon joins tech giants like IBM, Google, and Microsoft in the race to develop 
      practical quantum computers. Each company is pursuing different qubit technologies and architectures, 
      but Amazon's cat qubit approach represents a novel direction that could significantly reduce the barriers 
      to practical quantum computing.
    </p>
    <p>
      The company has stated that this technology could accelerate the timeline for useful quantum computing 
      applications by approximately five years. While still in the early prototype stage, the Oceiot chip 
      represents Amazon's commitment to becoming a key player in the quantum computing landscape.
    </p>
  `,
  sources: [
    {
      id: 's1',
      title: 'Amazon Fires Back at Microsoft with Its Own Quantum Chip',
      url: 'https://example.com/amazon-quantum-chip',
      iconUrl: 'https://www.reuters.com/favicon.ico',
      author: 'Reuters',
      timeAgo: '9 hours ago',
      readTime: '3 min'
    },
    {
      id: 's2',
      title: 'Amazon Bets Big on Quantum Computing With Oceiot-Fewer Qubits, Faster Results',
      url: 'https://example.com/amazon-quantum-bet',
      iconUrl: 'https://www.cnbc.com/favicon.ico',
      author: 'CNBC',
      timeAgo: '10 hours ago',
      readTime: '5 min'
    },
    {
      id: 's3',
      title: "Amazon's Oceiot quantum chip uses 'cat qubits' to 'reduce error correction by up to 90%'",
      url: 'https://example.com/oceiot-cat-qubits',
      iconUrl: 'https://www.techcrunch.com/favicon.ico',
      author: 'TechCrunch',
      timeAgo: '11 hours ago',
      readTime: '4 min'
    },
    {
      id: 's4',
      title: 'AWS unveils its quantum chip prototype, Oceiot - NextGov/FCW',
      url: 'https://example.com/aws-quantum-chip',
      iconUrl: 'https://www.nextgov.com/favicon.ico',
      author: 'NextGov',
      timeAgo: '12 hours ago',
      readTime: '6 min'
    },
    {
      id: 's5',
      title: 'Amazon Web Services (AWS) Unveils Oceiot: First Quantum Chip Promises Major Error Correction Breakthrough',
      url: 'https://example.com/aws-oceiot-unveil',
      iconUrl: 'https://www.example.com/favicon.ico',
      author: 'Tech News',
      timeAgo: '1 day ago',
      readTime: '8 min'
    }
  ],
  images: [
    {
      url: 'https://via.placeholder.com/600x400?text=Amazon+Quantum+Chip',
      alt: 'Amazon Oceiot Quantum Chip',
      sourceId: 's1'
    },
    {
      url: 'https://via.placeholder.com/600x400?text=Cat+Qubit+Diagram',
      alt: 'Cat Qubit Diagram',
      sourceId: 's2'
    },
    {
      url: 'https://via.placeholder.com/600x400?text=AWS+Quantum+Lab',
      alt: 'AWS Quantum Computing Laboratory',
      sourceId: 's3'
    }
  ]
};

// Mock related questions
const mockRelatedQuestions = [
  "What makes Oceiot's design unique compared to other quantum chips?",
  "How does Oceiot's implementation of cat qubits improve its functionality?",
  "What are the potential challenges Amazon might face with Oceiot?",
  "How does Oceiot's error correction mechanism work in practical terms?",
  "What are the future plans for Oceiot's development and integration into AWS services?"
];

// Mock related resources
const mockRelatedResources = [
  {
    id: 'r1',
    title: "IBM's Research-Ready Quantum Processor",
    imageUrl: 'https://via.placeholder.com/400x300?text=IBM+Quantum',
    description: 'IBM has unveiled its latest quantum processor, designed for cutting-edge research.',
    viewCount: 37276
  },
  {
    id: 'r2',
    title: "Google's Willow Quantum Chip",
    imageUrl: 'https://via.placeholder.com/400x300?text=Google+Quantum',
    description: "Google's newest quantum chip featuring advanced error correction capabilities.",
    viewCount: 56564
  },
  {
    id: 'r3',
    title: "MIT Sets World Record in Quantum Computing",
    imageUrl: 'https://via.placeholder.com/400x300?text=MIT+Quantum',
    description: 'MIT researchers have achieved a groundbreaking milestone in quantum computing efficiency.',
    viewCount: 85400
  },
  {
    id: 'r4',
    title: "Schrödinger's Cat Quantum Computing Explained",
    imageUrl: 'https://via.placeholder.com/400x300?text=Quantum+Cat',
    description: 'Based on reports from Nature Physics researchers.',
    viewCount: 68300
  }
];

interface SearchPageProps {
  searchParams: { q?: string };
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q || '';
  
  if (!query) {
    notFound();
  }
  
  return (
    <MainLayout>
      <Suspense fallback={<div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-t-2 border-teal-500"></div></div>}>
        <SearchResult 
          query={query} 
          result={mockSearchResult}
        />
        
        <div className="max-w-4xl mx-auto px-6">
          <RelatedQuestions questions={mockRelatedQuestions} />
          <RelatedResources resources={mockRelatedResources} />
        </div>
      </Suspense>
    </MainLayout>
  );
}
