import nodemailer from 'nodemailer';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error(
      'Missing EMAIL_USER / EMAIL_APP_PASSWORD env vars. See .env.example.'
    );
  }
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
  return _transporter;
}

function buildMailOptions(to, { subject, message, attachment, fromName, cc, bcc }) {
  return {
    from: fromName ? `"${fromName}" <${process.env.EMAIL_USER}>` : process.env.EMAIL_USER,
    to,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    subject,
    text: message,
    attachments:
      attachment && attachment.data
        ? [
            {
              filename: attachment.name,
              content: attachment.data.includes('base64,')
                ? attachment.data.split('base64,')[1]
                : attachment.data,
              encoding: 'base64',
            },
          ]
        : [],
  };
}

/**
 * Send to a list of recipients in batches with a small delay between batches
 * to stay under Gmail rate limits. Failures are captured per-recipient so one
 * bad address does not abort the whole run.
 *
 * Returns { sent, failed, total, errors: [{ email, error }] }.
 */
export async function sendBulk(
  { emails, subject, message, attachment, fromName, cc, bcc },
  { batchSize = 50, delayMs = 1000 } = {}
) {
  const transporter = getTransporter();
  const list = (emails || []).map((e) => e.trim()).filter(Boolean);

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      batch.map((email) =>
        transporter.sendMail(
          buildMailOptions(email, { subject, message, attachment, fromName, cc, bcc })
        )
      )
    );

    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        sent += 1;
      } else {
        failed += 1;
        errors.push({ email: batch[idx], error: res.reason?.message || 'send failed' });
      }
    });

    if (i + batchSize < list.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { sent, failed, total: list.length, errors };
}
