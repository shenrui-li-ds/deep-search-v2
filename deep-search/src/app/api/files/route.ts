import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listFiles, uploadFile, isDocsApiAvailable } from '@/lib/docs-api';

/**
 * GET /api/files - List user's files
 */
export async function GET(request: NextRequest) {
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
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'pending' | 'processing' | 'ready' | 'error' | null;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const result = await listFiles(user.id, {
      status: status || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files] Error listing files:', error);
    // Check for connection errors
    const message = error instanceof Error ? error.message : 'Failed to list files';
    if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { error: 'File storage service is not available' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/files - Upload a file
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
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    const allowedExtensions = ['.pdf', '.txt', '.md'];
    const filename = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PDF, TXT, MD' },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

    const result = await uploadFile(user.id, file, file.name);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/files] Error uploading file:', error);
    // Check for connection errors
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { error: 'File storage service is not available' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
