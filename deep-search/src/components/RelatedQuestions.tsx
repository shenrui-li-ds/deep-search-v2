"use client";

import React from 'react';
import Link from 'next/link';

interface RelatedQuestionsProps {
  questions: string[];
}

const RelatedQuestions: React.FC<RelatedQuestionsProps> = ({ questions }) => {
  return (
    <div className="mt-8 mb-4">
      <h3 className="text-lg font-medium text-white mb-4">People also ask</h3>
      
      <div className="space-y-2">
        {questions.map((question, index) => (
          <div key={index} className="border border-neutral-800 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left text-white hover:bg-neutral-800 transition-colors"
              onClick={() => {
                // Handle expansion or navigation
              }}
            >
              <span>{question}</span>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5 text-neutral-400" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RelatedQuestions;
