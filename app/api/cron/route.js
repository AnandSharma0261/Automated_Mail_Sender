import { NextResponse } from 'next/server';
import { processDueJobs } from '@/lib/processor';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Processes all due scheduled jobs. Meant to be hit on a schedule:
 *   - Vercel Cron (see vercel.json), or
 *   - an external cron (e.g. cron-job.org) every minute.
 *
 * Auth: requires the secret in either
 *   - Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this), or
 *   - ?secret=<CRON_SECRET>                  (handy for external cron services).
 */
async function handle(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const qs = new URL(req.url).searchParams.get('secret');
    const ok = auth === `Bearer ${secret}` || qs === secret;
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const processed = await processDueJobs();
  return NextResponse.json({ success: true, ranAt: Date.now(), processed });
}

export async function GET(req) {
  return handle(req);
}

export async function POST(req) {
  return handle(req);
}
