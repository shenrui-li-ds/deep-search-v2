"use client";

import React, { useEffect, useCallback, useState, useRef } from 'react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Swipe handling
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Handle open state
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    }
  }, [isOpen]);

  // Handle close when parent sets isOpen to false
  useEffect(() => {
    if (!isOpen && shouldRender && !isClosing) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender, isClosing]);

  // Close with animation
  const handleClose = useCallback((skipAnimation = false) => {
    if (skipAnimation) {
      setShouldRender(false);
      onClose();
    } else {
      setIsClosing(true);
      setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
        onClose();
      }, 150); // Match animation duration
    }
  }, [onClose]);

  // Close on escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  // Touch handlers for swipe-to-close gesture
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchCurrentY.current = e.touches[0].clientY;

    const deltaY = touchCurrentY.current - touchStartY.current;

    // Only allow dragging down (positive delta)
    if (deltaY > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const deltaY = touchCurrentY.current - touchStartY.current;
    const threshold = 80; // Swipe distance needed to close

    if (deltaY > threshold) {
      // Swipe was far enough - animate to fully closed position, then remove
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.15s ease-out';
        sheetRef.current.style.transform = 'translateY(100%)';
      }
      setTimeout(() => {
        handleClose(true);
      }, 150);
    } else {
      // Swipe wasn't far enough - snap back to open position
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.15s ease-out';
        sheetRef.current.style.transform = 'translateY(0)';
        setTimeout(() => {
          if (sheetRef.current) {
            sheetRef.current.style.transform = '';
            sheetRef.current.style.transition = '';
          }
        }, 150);
      }
    }
  }, [handleClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (shouldRender && !isClosing) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shouldRender, isClosing, handleKeyDown]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[9999] md:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={() => handleClose()}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 bg-[var(--background)] rounded-t-2xl ${
          isClosing ? 'animate-slide-down' : 'animate-slide-up'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[var(--border)] rounded-full" />
        </div>

        {/* Title with close button */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-2 border-b border-[var(--border)]">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
            <button
              onClick={() => handleClose()}
              className="p-1.5 -mr-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-4 pt-4 pb-2 max-h-[70vh] overflow-y-auto">
          {children}
        </div>

        {/* Bottom safe area padding - extends to physical bottom of screen */}
        <div className="pb-[env(safe-area-inset-bottom,0px)] bg-[var(--background)]">
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
};

export default MobileBottomSheet;
