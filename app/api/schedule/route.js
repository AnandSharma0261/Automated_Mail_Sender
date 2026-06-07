import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getStore, usingPersistentStore } from '@/lib/store';

export const runtime = 'nodejs';

// Create a scheduled job
export async function POST(req) {
  try {
    const { emails, subject, message, attachment, sendAt } = await req.json();

    const list = Array.isArray(emails)
      ? emails.map((e) => e.trim()).filter(Boolean)
      : [];

    if (list.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Please provide at least one recipient.' },
        { status: 400 }
      );
    }
    if (!subject || !message) {
      return NextResponse.json(
        { success: false, message: 'Subject and message are required.' },
        { status: 400 }
      );
    }

    const ts = new Date(sendAt).getTime();
    if (!sendAt || Number.isNaN(ts)) {
      return NextResponse.json(
        { success: false, message: 'A valid send time is required.' },
        { status: 400 }
      );
    }
    if (ts < Date.now() - 60 * 1000) {
      return NextResponse.json(
        { success: false, message: 'Send time must be in the future.' },
        { status: 400 }
      );
    }

    const job = {
      id: randomUUID(),
      subject,
      message,
      emails: list,
      attachment: attachment || null,
      sendAt: ts,
      status: 'scheduled',
      createdAt: Date.now(),
      total: list.length,
      sentCount: 0,
      failedCount: 0,
      error: null,
    };

    await getStore().create(job);

    return NextResponse.json({
      success: true,
      message: `Scheduled ${list.length} emails for ${new Date(ts).toLocaleString()}.`,
      persistent: usingPersistentStore,
      job: stripAttachment(job),
    });
  } catch (error) {
    console.error('schedule error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Error scheduling emails' },
      { status: 500 }
    );
  }
}

// List all jobs
export async function GET() {
  const jobs = await getStore().list();
  return NextResponse.json({
    success: true,
    persistent: usingPersistentStore,
    jobs: jobs.map(stripAttachment),
  });
}

// Cancel / delete a job: /api/schedule?id=...
export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { success: false, message: 'Missing job id.' },
      { status: 400 }
    );
  }
  await getStore().remove(id);
  return NextResponse.json({ success: true, message: 'Job deleted.' });
}

// Don't ship base64 attachment blobs back to the browser when listing.
function stripAttachment(job) {
  if (!job) return job;
  const { attachment, ...rest } = job;
  return { ...rest, attachmentName: attachment?.name || null };
}
