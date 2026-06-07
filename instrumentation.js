/**
 * Dev-only scheduler.
 *
 * On a persistent host (local `next dev` / `next start`) there is no external
 * cron, so we poll our own /api/cron every 30s. We call it over HTTP (rather
 * than importing the processor) so nodemailer never lands in the edge bundle.
 *
 * On Vercel (serverless) this is skipped — Vercel Cron / cron-job.org hits
 * /api/cron instead. Guarded so it can't run more than once.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.VERCEL) return; // real cron handles production
  if (globalThis.__schedulerStarted) return;
  globalThis.__schedulerStarted = true;

  const port = process.env.PORT || 3000;
  const secret = process.env.CRON_SECRET;
  const url = `http://127.0.0.1:${port}/api/cron${secret ? `?secret=${secret}` : ''}`;

  setInterval(async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data?.processed?.length) {
        console.log(`[scheduler] processed ${data.processed.length} job(s)`, data.processed);
      }
    } catch {
      /* server may not be ready yet; ignore */
    }
  }, 30 * 1000);

  console.log('[scheduler] dev poller started (every 30s)');
}
