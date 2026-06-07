import { getStore } from './store';
import { sendBulk } from './mailer';

/**
 * Send every job whose time has come. Shared by the /api/cron route and the
 * dev-only poller in instrumentation.js. Claims each job before sending so
 * overlapping runs cannot double-send.
 */
export async function processDueJobs() {
  const store = getStore();
  const due = await store.due(Date.now());
  const processed = [];

  for (const job of due) {
    const claimed = await store.update(job.id, { status: 'sending' });
    if (!claimed || claimed.status !== 'sending') continue;

    try {
      const result = await sendBulk(job);
      await store.update(job.id, {
        status: result.failed === result.total && result.total > 0 ? 'failed' : 'sent',
        sentCount: result.sent,
        failedCount: result.failed,
        sentAt: Date.now(),
        error: result.errors.length ? result.errors.slice(0, 5) : null,
      });
      processed.push({ id: job.id, sent: result.sent, failed: result.failed });
    } catch (error) {
      await store.update(job.id, { status: 'failed', error: error.message });
      processed.push({ id: job.id, error: error.message });
    }
  }

  return processed;
}
