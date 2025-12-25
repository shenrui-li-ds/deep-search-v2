"use client";

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface RelatedQuestionsProps {
  questions: string[];
}

const RelatedQuestions: React.FC<RelatedQuestionsProps> = ({ questions }) => {
  return (
    <div className="mt-8 mb-4">
      <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">People also ask</h3>

      <div className="space-y-2">
        {questions.map((question, index) => (
          <Card key={index} className="overflow-hidden hover:border-[var(--accent)] transition-colors">
            <Link
              href={`/search?q=${encodeURIComponent(question)}`}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-[var(--text-secondary)] hover:bg-[var(--card)] transition-colors"
            >
              <span>{question}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-[var(--text-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default RelatedQuestions;
