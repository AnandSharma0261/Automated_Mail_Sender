import { NextResponse } from 'next/server';
import { sendBulk } from '@/lib/mailer';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { emails, subject, message, attachment, fromName, cc, bcc } = await req.json();

    if (!Array.isArray(emails) || emails.length === 0) {
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

    const result = await sendBulk({ emails, subject, message, attachment, fromName, cc, bcc });

    return NextResponse.json({
      success: true,
      message: `Sent ${result.sent}/${result.total} emails${
        result.failed ? `, ${result.failed} failed` : ''
      }.`,
      ...result,
    });
  } catch (error) {
    console.error('send error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Error sending emails' },
      { status: 500 }
    );
  }
}
