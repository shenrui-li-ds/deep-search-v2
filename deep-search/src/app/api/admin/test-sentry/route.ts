import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { checkAdminAccess } from '@/lib/supabase/server';
import { createApiLogger } from '@/lib/logger';

/**
 * Admin-only endpoint to test Sentry error reporting.
 * Only users with 'admin' tier can access this endpoint.
 *
 * GET: Trigger a test error and report to Sentry
 */
export async function GET() {
  const log = createApiLogger('admin/test-sentry');

  try {
    // Check admin access
    const adminCheck = await checkAdminAccess();

    if (!adminCheck.isAdmin) {
      log.warn('Unauthorized admin endpoint access', {
        userId: adminCheck.userId,
        tier: adminCheck.tier,
        error: adminCheck.error,
      });
      return NextResponse.json(
        { error: adminCheck.error },
        { status: adminCheck.status || 403 }
      );
    }

    // Admin verified - trigger test error
    log.info('Admin test endpoint called - triggering Sentry test error', {
      userId: adminCheck.userId,
      userEmail: adminCheck.userEmail,
    });

    const testError = new Error('Sentry admin test error - triggered by admin user');

    // Report to Sentry with context
    Sentry.withScope((scope) => {
      scope.setTag('test', 'true');
      scope.setTag('triggered_by', adminCheck.userEmail || adminCheck.userId || 'unknown');
      scope.setLevel('error');
      scope.setExtra('purpose', 'Admin-triggered Sentry connectivity test');
      scope.setExtra('timestamp', new Date().toISOString());
      Sentry.captureException(testError);
    });

    log.info('Sentry test error sent successfully', { userId: adminCheck.userId });

    return NextResponse.json({
      success: true,
      message: 'Test error sent to Sentry',
      details: {
        errorMessage: testError.message,
        timestamp: new Date().toISOString(),
        triggeredBy: adminCheck.userEmail,
      },
    });
  } catch (error) {
    log.error('Unexpected error in admin test endpoint', {}, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
