"use client";

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';
import MobileHeader from './MobileHeader';

interface MainLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  hideHeader?: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, pageTitle, hideHeader = false }) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Header */}
      {!hideHeader && (
        <MobileHeader
          onMenuClick={() => setIsMobileSidebarOpen(true)}
          title={pageTitle}
        />
      )}

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content */}
      {/* On desktop: ml-[72px] for sidebar space */}
      {/* On mobile: no margin, but pt-14 for header space (unless hideHeader) */}
      <main className={`md:ml-[72px] min-h-screen ${!hideHeader ? 'pt-14 md:pt-0' : ''}`}>
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
