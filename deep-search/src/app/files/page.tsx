'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MainLayout from '@/components/MainLayout';
import { getUserCredits } from '@/lib/supabase/database';

interface DocsFile {
  id: string;
  filename: string;
  original_filename: string;
  file_type: 'pdf' | 'txt' | 'md';
  file_size: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  chunk_count: number | null;
  created_at: string;
  expires_at: string;
  entities_enabled: boolean;
  entities_status: 'pending' | 'processing' | 'ready' | 'error' | null;
  entities_progress: number | null;
  error_message?: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ready': return 'bg-green-500/10 text-green-500';
    case 'processing': return 'bg-blue-500/10 text-blue-500';
    case 'pending': return 'bg-yellow-500/10 text-yellow-500';
    case 'error': return 'bg-red-500/10 text-red-500';
    default: return 'bg-gray-500/10 text-gray-500';
  }
}

function getFileTypeIcon(type: string): React.ReactNode {
  switch (type) {
    case 'pdf':
      return (
        <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case 'md':
      return (
        <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    default:
      return (
        <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
  }
}

interface FileItemProps {
  file: DocsFile;
  onDelete: (id: string) => void;
  onToggleEntities: (id: string, enable: boolean) => void;
  isDeleting: boolean;
  isTogglingEntities: boolean;
}

function FileItem({ file, onDelete, onToggleEntities, isDeleting, isTogglingEntities }: FileItemProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  return (
    <div className="p-4 bg-[var(--card)] rounded-lg border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors">
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="flex-shrink-0 mt-0.5">
          {getFileTypeIcon(file.file_type)}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
              {file.original_filename}
            </h3>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(file.status)}`}>
              {file.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>{formatFileSize(file.file_size)}</span>
            <span>{file.file_type.toUpperCase()}</span>
            {file.chunk_count !== null && (
              <span>{file.chunk_count} chunks</span>
            )}
            <span>{formatTimeRemaining(file.expires_at)}</span>
          </div>

          {/* Entity extraction status */}
          {file.entities_enabled && file.entities_status && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">Deep Analysis:</span>
              <span className={`px-2 py-0.5 font-medium rounded-full ${getStatusColor(file.entities_status)}`}>
                {file.entities_status}
                {file.entities_progress !== null && file.entities_status === 'processing' && (
                  <span className="ml-1">({file.entities_progress}%)</span>
                )}
              </span>
            </div>
          )}

          {/* Error message */}
          {file.error_message && (
            <p className="mt-2 text-xs text-red-500">{file.error_message}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle entities button (only for ready files) */}
          {file.status === 'ready' && (
            <button
              onClick={() => onToggleEntities(file.id, !file.entities_enabled)}
              disabled={isTogglingEntities || file.entities_status === 'processing'}
              className={`p-2 rounded-lg transition-colors ${
                file.entities_enabled
                  ? 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20'
                  : 'bg-[var(--background)] text-[var(--text-muted)] hover:bg-[var(--card-hover)]'
              } disabled:opacity-50`}
              title={file.entities_enabled ? 'Disable Deep Analysis' : 'Enable Deep Analysis'}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            </button>
          )}

          {/* Delete button */}
          {showConfirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete(file.id);
                  setShowConfirmDelete(false);
                }}
                disabled={isDeleting}
                className="px-2 py-1 text-xs font-medium text-red-500 bg-red-500/10 rounded hover:bg-red-500/20 disabled:opacity-50"
              >
                {isDeleting ? '...' : 'Delete'}
              </button>
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] bg-[var(--background)] rounded hover:bg-[var(--card-hover)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="p-2 rounded-lg bg-[var(--background)] text-[var(--text-muted)] hover:bg-[var(--card-hover)] hover:text-red-500 transition-colors"
              title="Delete file"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FilesPage() {
  const [files, setFiles] = useState<DocsFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [togglingEntityIds, setTogglingEntityIds] = useState<Set<string>>(new Set());
  const [userTier, setUserTier] = useState<'free' | 'pro' | 'admin' | null>(null);
  const [isTierLoading, setIsTierLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if user can use files (pro or admin only)
  const canUseFiles = userTier === 'pro' || userTier === 'admin';

  // Fetch user tier on mount
  useEffect(() => {
    async function fetchUserTier() {
      try {
        const credits = await getUserCredits();
        setUserTier(credits?.user_tier || 'free');
      } catch {
        setUserTier('free');
      } finally {
        setIsTierLoading(false);
      }
    }
    fetchUserTier();
  }, []);

  // Fetch files
  const fetchFiles = useCallback(async () => {
    try {
      const response = await fetch('/api/files');
      if (!response.ok) {
        const data = await response.json();
        // Check for service unavailability
        if (response.status === 503) {
          throw new Error('File storage service is not available. Please try again later.');
        }
        throw new Error(data.error || 'Failed to fetch files');
      }
      const data = await response.json();
      setFiles(data.files || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch files';
      // Improve error message for connection failures
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        setError('File storage service is not available. Please try again later.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling for processing files (only for pro/admin users)
  useEffect(() => {
    // Don't fetch until we know user tier
    if (isTierLoading || !canUseFiles) {
      setIsLoading(false);
      return;
    }

    fetchFiles();

    // Poll every 5 seconds if there are processing files
    pollIntervalRef.current = setInterval(() => {
      const hasProcessing = files.some(
        f => f.status === 'pending' || f.status === 'processing' ||
             (f.entities_status === 'pending' || f.entities_status === 'processing')
      );
      if (hasProcessing) {
        fetchFiles();
      }
    }, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchFiles, files, isTierLoading, canUseFiles]);

  // Handle file upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload file');
      }

      // Refresh files list
      await fetchFiles();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle file deletion
  const handleDelete = async (fileId: string) => {
    setDeletingIds(prev => new Set(prev).add(fileId));

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete file');
      }

      // Remove from list
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  // Handle entity toggle
  const handleToggleEntities = async (fileId: string, enable: boolean) => {
    setTogglingEntityIds(prev => new Set(prev).add(fileId));

    try {
      const response = await fetch(`/api/files/${fileId}/entities`, {
        method: enable ? 'POST' : 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle entity extraction');
      }

      // Refresh files list
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle entity extraction');
    } finally {
      setTogglingEntityIds(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  return (
    <MainLayout pageTitle="Files">
      <div className="min-h-screen bg-[var(--background)]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Files</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Upload documents to search and analyze. Files expire after 24 hours.
              </p>
            </div>

            {/* Upload button - only for pro/admin users */}
            {!isTierLoading && canUseFiles && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={handleUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors ${
                    isUploading
                      ? 'bg-[var(--card)] text-[var(--text-muted)] cursor-not-allowed'
                      : 'bg-[var(--accent)] text-white hover:opacity-90'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Upload File
                    </>
                  )}
                </label>
              </div>
            )}
          </div>

          {/* Loading tier check */}
          {isTierLoading && (
            <div className="flex items-center justify-center py-12">
              <svg className="h-8 w-8 animate-spin text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}

          {/* Premium feature notice for free tier users */}
          {!isTierLoading && !canUseFiles && (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                <svg className="h-8 w-8 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
                Pro Feature
              </h2>
              <p className="text-[var(--text-muted)] mb-6 max-w-md mx-auto">
                File upload and document analysis is available for Pro users.
                Upgrade to upload PDFs, TXT, and Markdown files, then attach them to your searches for document-aware answers.
              </p>
              <a
                href="/account"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                View Account
              </a>
            </div>
          )}

          {/* Content for pro/admin users */}
          {!isTierLoading && canUseFiles && (
            <>
              {/* Upload error */}
              {uploadError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
                  {uploadError}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
                  {error}
                  <button
                    onClick={() => setError(null)}
                    className="ml-2 underline hover:no-underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <svg className="h-8 w-8 animate-spin text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && files.length === 0 && (
                <div className="text-center py-12">
                  <svg className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No files uploaded</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    Upload PDF, TXT, or MD files to search and analyze them.
                  </p>
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium cursor-pointer bg-[var(--accent)] text-white hover:opacity-90 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Upload your first file
                  </label>
                </div>
              )}

              {/* Files list */}
              {!isLoading && files.length > 0 && (
                <div className="space-y-3">
                  {files.map(file => (
                    <FileItem
                      key={file.id}
                      file={file}
                      onDelete={handleDelete}
                      onToggleEntities={handleToggleEntities}
                      isDeleting={deletingIds.has(file.id)}
                      isTogglingEntities={togglingEntityIds.has(file.id)}
                    />
                  ))}
                </div>
              )}

              {/* Info footer */}
              <div className="mt-8 p-4 bg-[var(--card)] rounded-lg border border-[var(--border)]">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">About Files</h4>
                <ul className="text-xs text-[var(--text-muted)] space-y-1">
                  <li>• Supported formats: PDF, TXT, MD (max 10MB)</li>
                  <li>• Files are automatically deleted after 24 hours</li>
                  <li>• Enable &quot;Deep Analysis&quot; for multi-hop reasoning on complex documents</li>
                  <li>• Attach files to any search to include document context</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
