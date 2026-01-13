import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntityStatus, enableEntities, disableEntities, isDocsApiAvailable } from '@/lib/docs-api';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/files/[id]/entities - Get entity extraction status
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

    const result = await getEntityStatus(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files/[id]/entities] Error getting entity status:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get entity status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/files/[id]/entities - Enable entity extraction
 */
export async function POST(
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

    const result = await enableEntities(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files/[id]/entities] Error enabling entities:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enable entity extraction' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/[id]/entities - Disable entity extraction
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

    const result = await disableEntities(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files/[id]/entities] Error disabling entities:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disable entity extraction' },
      { status: 500 }
    );
  }
}
