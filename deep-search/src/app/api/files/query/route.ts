import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { queryDocs, queryDocsStream, isDocsApiAvailable, type QueryMode } from '@/lib/docs-api';

/**
 * POST /api/files/query - Query documents
 *
 * Body:
 * - query: string (required)
 * - fileIds: string[] (required)
 * - mode: 'simple' | 'detailed' | 'deep' (optional, default: 'simple')
 * - stream: boolean (optional, default: false)
 */
export async function POST(request: NextRequest) {
  // Check if Docs API is available
  if (!isDocsApiAvailable()) {
    return NextResponse.json(
      { error: 'File storage is not configured' },
      { status: 503 }
    );
  }

  // Authenticate user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { query, fileIds, mode = 'simple', stream = false } = body;

    // Validate required fields
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one file ID is required' },
        { status: 400 }
      );
    }

    // Validate mode
    const validModes: QueryMode[] = ['simple', 'detailed', 'deep'];
    if (!validModes.includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be: simple, detailed, or deep' },
        { status: 400 }
      );
    }

    // Streaming response
    if (stream) {
      const response = await queryDocsStream(user.id, query, fileIds, mode);

      // Forward the streaming response
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const result = await queryDocs(user.id, query, fileIds, mode);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files/query] Error querying documents:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query documents' },
      { status: 500 }
    );
  }
}
