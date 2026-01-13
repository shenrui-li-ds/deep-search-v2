import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getFile, deleteFile, isDocsApiAvailable } from '@/lib/docs-api';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/files/[id] - Get file details
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
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
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const result = await getFile(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files/[id]] Error getting file:', error);

    // Check for 404
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/[id] - Delete a file
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
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
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const result = await deleteFile(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files/[id]] Error deleting file:', error);

    // Check for 404
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete file' },
      { status: 500 }
    );
  }
}
