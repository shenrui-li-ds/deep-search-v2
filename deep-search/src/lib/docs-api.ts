/**
 * Athenius Docs API Client
 *
 * Server-side client for communicating with the Athenius Docs API.
 * Handles file upload, management, and document querying.
 */

// Types
export interface DocsFile {
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

export interface DocsSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  content: string;
}

export interface UploadResponse {
  fileId: string;
  filename: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  status: 'pending';
  message: string;
}

export interface ListFilesResponse {
  files: DocsFile[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface QueryResponse {
  content: string;
  sources: DocsSource[];
}

export interface EntityStats {
  entityCount: number;
  relationshipCount: number;
  entityTypes: Record<string, number>;
}

export interface EntityStatusResponse {
  fileId: string;
  entitiesEnabled: boolean;
  entitiesStatus: string | null;
  entitiesProgress: number | null;
  stats: EntityStats | null;
}

export type QueryMode = 'simple' | 'detailed' | 'deep';

// Configuration
function getConfig() {
  const apiUrl = process.env.DOCS_API_URL;
  const apiKey = process.env.ATHENIUS_API_KEY;

  if (!apiUrl) {
    throw new Error('DOCS_API_URL is not configured');
  }
  if (!apiKey) {
    throw new Error('ATHENIUS_API_KEY is not configured');
  }

  return { apiUrl, apiKey };
}

function getHeaders(userId: string): HeadersInit {
  const { apiKey } = getConfig();
  return {
    'Authorization': `Bearer ${apiKey}`,
    'X-User-ID': userId,
  };
}

// API Functions

/**
 * List all files for a user
 */
export async function listFiles(
  userId: string,
  options?: {
    status?: 'pending' | 'processing' | 'ready' | 'error';
    limit?: number;
    offset?: number;
  }
): Promise<ListFilesResponse> {
  const { apiUrl } = getConfig();

  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const url = `${apiUrl}/api/v1/files${params.toString() ? `?${params}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(userId),
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = `Failed to list files: ${response.status}`;
    try {
      const error = JSON.parse(text);
      errorMessage = error.error || error.message || errorMessage;
    } catch {
      // Response is not JSON - include status and text preview
      errorMessage = `API error ${response.status}: ${text.slice(0, 100)}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Upload a file for processing
 */
export async function uploadFile(
  userId: string,
  file: File | Blob,
  filename: string
): Promise<UploadResponse> {
  const { apiUrl } = getConfig();

  const formData = new FormData();
  formData.append('file', file, filename);

  const response = await fetch(`${apiUrl}/api/v1/files`, {
    method: 'POST',
    headers: getHeaders(userId),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to upload file: ${response.status}`);
  }

  return response.json();
}

/**
 * Get file details
 */
export async function getFile(
  userId: string,
  fileId: string
): Promise<{ file: DocsFile }> {
  const { apiUrl } = getConfig();

  const response = await fetch(`${apiUrl}/api/v1/files/${fileId}`, {
    method: 'GET',
    headers: getHeaders(userId),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get file: ${response.status}`);
  }

  return response.json();
}

/**
 * Delete a file
 */
export async function deleteFile(
  userId: string,
  fileId: string
): Promise<{ success: boolean; message: string }> {
  const { apiUrl } = getConfig();

  const response = await fetch(`${apiUrl}/api/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: getHeaders(userId),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to delete file: ${response.status}`);
  }

  return response.json();
}

/**
 * Query documents (non-streaming)
 */
export async function queryDocs(
  userId: string,
  query: string,
  fileIds: string[],
  mode: QueryMode = 'simple'
): Promise<QueryResponse> {
  const { apiUrl } = getConfig();

  const response = await fetch(`${apiUrl}/api/v1/files/query`, {
    method: 'POST',
    headers: {
      ...getHeaders(userId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      fileIds,
      mode,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to query docs: ${response.status}`);
  }

  return response.json();
}

/**
 * Query documents with streaming
 * Returns a ReadableStream that can be piped to the client
 */
export async function queryDocsStream(
  userId: string,
  query: string,
  fileIds: string[],
  mode: QueryMode = 'simple'
): Promise<Response> {
  const { apiUrl } = getConfig();

  const response = await fetch(`${apiUrl}/api/v1/files/query`, {
    method: 'POST',
    headers: {
      ...getHeaders(userId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      fileIds,
      mode,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to query docs: ${response.status}`);
  }

  return response;
}

/**
 * Get entity extraction status
 */
export async function getEntityStatus(
  userId: string,
  fileId: string
): Promise<EntityStatusResponse> {
  const { apiUrl } = getConfig();

  const response = await fetch(`${apiUrl}/api/v1/files/${fileId}/entities`, {
    method: 'GET',
    headers: getHeaders(userId),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get entity status: ${response.status}`);
  }

  return response.json();
}

/**
 * Enable entity extraction for a file
 */
export async function enableEntities(
  userId: string,
  fileId: string
): Promise<{ success: boolean; message: string; status: string }> {
  const { apiUrl } = getConfig();

  const response = await fetch(`${apiUrl}/api/v1/files/${fileId}/entities`, {
    method: 'POST',
    headers: getHeaders(userId),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to enable entities: ${response.status}`);
  }

  return response.json();
}

/**
 * Disable entity extraction for a file
 */
export async function disableEntities(
  userId: string,
  fileId: string
): Promise<{ success: boolean; message: string }> {
  const { apiUrl } = getConfig();

  const response = await fetch(`${apiUrl}/api/v1/files/${fileId}/entities`, {
    method: 'DELETE',
    headers: getHeaders(userId),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to disable entities: ${response.status}`);
  }

  return response.json();
}

/**
 * Check if Docs API is available
 */
export function isDocsApiAvailable(): boolean {
  return !!(process.env.DOCS_API_URL && process.env.ATHENIUS_API_KEY);
}
