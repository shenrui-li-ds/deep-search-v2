import {
  listFiles,
  uploadFile,
  getFile,
  deleteFile,
  queryDocs,
  getEntityStatus,
  enableEntities,
  disableEntities,
  isDocsApiAvailable,
  DocsFile,
  ListFilesResponse,
  QueryResponse,
} from '@/lib/docs-api';

// Mock fetch globally
global.fetch = jest.fn();

describe('Docs API Client', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DOCS_API_URL = 'http://localhost:3001';
    process.env.ATHENIUS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.DOCS_API_URL;
    delete process.env.ATHENIUS_API_KEY;
  });

  describe('isDocsApiAvailable', () => {
    it('returns true when both env vars are set', () => {
      expect(isDocsApiAvailable()).toBe(true);
    });

    it('returns false when DOCS_API_URL is missing', () => {
      delete process.env.DOCS_API_URL;
      expect(isDocsApiAvailable()).toBe(false);
    });

    it('returns false when ATHENIUS_API_KEY is missing', () => {
      delete process.env.ATHENIUS_API_KEY;
      expect(isDocsApiAvailable()).toBe(false);
    });

    it('returns false when both are missing', () => {
      delete process.env.DOCS_API_URL;
      delete process.env.ATHENIUS_API_KEY;
      expect(isDocsApiAvailable()).toBe(false);
    });
  });

  describe('listFiles', () => {
    const mockResponse: ListFilesResponse = {
      files: [
        {
          id: 'file-1',
          filename: 'doc_abc123.txt',
          original_filename: 'test.txt',
          file_type: 'txt',
          file_size: 1024,
          status: 'ready',
          chunk_count: 5,
          created_at: '2024-01-15T10:00:00Z',
          expires_at: '2024-01-16T10:00:00Z',
          entities_enabled: false,
          entities_status: null,
          entities_progress: null,
        },
      ],
      pagination: {
        limit: 50,
        offset: 0,
        total: 1,
      },
    };

    it('fetches files with correct headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await listFiles(mockUserId);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/files',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key',
            'X-User-ID': mockUserId,
          },
        })
      );
    });

    it('includes status filter in URL when provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await listFiles(mockUserId, { status: 'ready' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/files?status=ready',
        expect.any(Object)
      );
    });

    it('includes pagination params when provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await listFiles(mockUserId, { limit: 10, offset: 20 });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/files?limit=10&offset=20',
        expect.any(Object)
      );
    });

    it('returns files list', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await listFiles(mockUserId);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].original_filename).toBe('test.txt');
      expect(result.pagination.total).toBe(1);
    });

    it('throws error on API failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: 'Internal server error' })),
      });

      await expect(listFiles(mockUserId)).rejects.toThrow('Internal server error');
    });

    it('throws error when DOCS_API_URL is not configured', async () => {
      delete process.env.DOCS_API_URL;

      await expect(listFiles(mockUserId)).rejects.toThrow('DOCS_API_URL is not configured');
    });
  });

  describe('uploadFile', () => {
    const mockUploadResponse = {
      fileId: 'new-file-id',
      filename: 'doc_xyz789.pdf',
      originalFilename: 'document.pdf',
      fileType: 'pdf',
      fileSize: 2048,
      status: 'pending',
      message: 'File uploaded successfully',
    };

    it('uploads file with correct headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse),
      });

      const mockFile = new Blob(['test content'], { type: 'application/pdf' });
      await uploadFile(mockUserId, mockFile, 'document.pdf');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/files',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'X-User-ID': mockUserId,
          },
        })
      );
    });

    it('returns upload response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse),
      });

      const mockFile = new Blob(['test content'], { type: 'application/pdf' });
      const result = await uploadFile(mockUserId, mockFile, 'document.pdf');

      expect(result.fileId).toBe('new-file-id');
      expect(result.status).toBe('pending');
    });

    it('throws error on upload failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'File too large' }),
      });

      const mockFile = new Blob(['test content'], { type: 'application/pdf' });
      await expect(uploadFile(mockUserId, mockFile, 'document.pdf')).rejects.toThrow('File too large');
    });
  });

  describe('getFile', () => {
    const mockFile: DocsFile = {
      id: 'file-1',
      filename: 'doc_abc123.txt',
      original_filename: 'test.txt',
      file_type: 'txt',
      file_size: 1024,
      status: 'ready',
      chunk_count: 5,
      created_at: '2024-01-15T10:00:00Z',
      expires_at: '2024-01-16T10:00:00Z',
      entities_enabled: false,
      entities_status: null,
      entities_progress: null,
    };

    it('fetches file by ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ file: mockFile }),
      });

      await getFile(mockUserId, 'file-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/files/file-1',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('returns file details', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ file: mockFile }),
      });

      const result = await getFile(mockUserId, 'file-1');

      expect(result.file.id).toBe('file-1');
      expect(result.file.status).toBe('ready');
    });

    it('throws error when file not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'File not found' }),
      });

      await expect(getFile(mockUserId, 'nonexistent')).rejects.toThrow('File not found');
    });
  });

  describe('deleteFile', () => {
    it('deletes file by ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'File deleted' }),
      });

      await deleteFile(mockUserId, 'file-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/files/file-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('returns success response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'File deleted' }),
      });

      const result = await deleteFile(mockUserId, 'file-1');

      expect(result.success).toBe(true);
    });
  });

  describe('queryDocs', () => {
    const mockQueryResponse: QueryResponse = {
      content: 'The answer based on your documents is...',
      sources: [
        {
          id: 'chunk-1',
          title: 'test.txt - Section 1',
          url: '',
          snippet: 'Relevant excerpt...',
          content: 'Full content of the chunk...',
        },
      ],
    };

    it('queries documents with correct body', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQueryResponse),
      });

      await queryDocs(mockUserId, 'What is the main topic?', ['file-1', 'file-2'], 'simple');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/files/query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            query: 'What is the main topic?',
            fileIds: ['file-1', 'file-2'],
            mode: 'simple',
            stream: false,
          }),
        })
      );
    });

    it('returns query response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQueryResponse),
      });

      const result = await queryDocs(mockUserId, 'test query', ['file-1']);

      expect(result.content).toBeTruthy();
      expect(result.sources).toHaveLength(1);
    });

    it('uses default mode when not specified', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQueryResponse),
      });

      await queryDocs(mockUserId, 'test', ['file-1']);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.mode).toBe('simple');
    });
  });

  describe('Entity Extraction', () => {
    describe('getEntityStatus', () => {
      it('fetches entity status', async () => {
        const mockStatus = {
          fileId: 'file-1',
          entitiesEnabled: true,
          entitiesStatus: 'ready',
          entitiesProgress: 100,
          stats: {
            entityCount: 25,
            relationshipCount: 15,
            entityTypes: { Person: 10, Organization: 15 },
          },
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockStatus),
        });

        const result = await getEntityStatus(mockUserId, 'file-1');

        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/v1/files/file-1/entities',
          expect.objectContaining({ method: 'GET' })
        );
        expect(result.entitiesEnabled).toBe(true);
        expect(result.stats?.entityCount).toBe(25);
      });
    });

    describe('enableEntities', () => {
      it('enables entity extraction', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Entity extraction started', status: 'pending' }),
        });

        const result = await enableEntities(mockUserId, 'file-1');

        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/v1/files/file-1/entities',
          expect.objectContaining({ method: 'POST' })
        );
        expect(result.success).toBe(true);
      });
    });

    describe('disableEntities', () => {
      it('disables entity extraction', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Entity extraction disabled' }),
        });

        const result = await disableEntities(mockUserId, 'file-1');

        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/v1/files/file-1/entities',
          expect.objectContaining({ method: 'DELETE' })
        );
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('handles non-JSON error responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      });

      await expect(listFiles(mockUserId)).rejects.toThrow('API error 502: Bad Gateway');
    });

    it('handles network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(listFiles(mockUserId)).rejects.toThrow('Network error');
    });
  });
});
