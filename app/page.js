'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function parseEmails(text) {
  return text
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

// Convert an epoch (ms) to the value <input type="datetime-local"> expects,
// expressed in the user's LOCAL timezone.
function toLocalInput(ms) {
  const d = new Date(ms);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function defaultSendAt() {
  return toLocalInput(Date.now() + 10 * 60 * 1000); // 10 minutes from now
}

export default function Home() {
  const [mode, setMode] = useState('now'); // 'now' | 'schedule'
  const [emailsText, setEmailsText] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sendAt, setSendAt] = useState(defaultSendAt());
  const [attachment, setAttachment] = useState(null); // { name, data }
  const [editingId, setEditingId] = useState(null); // job id being edited
  const [keepAttachmentName, setKeepAttachmentName] = useState(null); // existing file when editing
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type, text }

  const [jobs, setJobs] = useState([]);
  const [persistent, setPersistent] = useState(null);

  const recipients = useMemo(() => parseEmails(emailsText), [emailsText]);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs);
        setPersistent(data.persistent);
      }
    } catch {
      /* ignore transient fetch errors */
    }
  }, []);

  useEffect(() => {
    refreshJobs();
    const t = setInterval(refreshJobs, 10000);
    return () => clearInterval(t);
  }, [refreshJobs]);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAttachment({ name: file.name, data: ev.target.result });
    reader.readAsDataURL(file);
    setKeepAttachmentName(null); // a freshly chosen file replaces the old one
  }

  function resetForm() {
    setEmailsText('');
    setSubject('');
    setMessage('');
    setAttachment(null);
    setEditingId(null);
    setKeepAttachmentName(null);
    setSendAt(defaultSendAt());
  }

  function handleEdit(job) {
    setMode('schedule');
    setEditingId(job.id);
    setEmailsText((job.emails || []).join('\n'));
    setSubject(job.subject || '');
    setMessage(job.message || '');
    setSendAt(toLocalInput(job.sendAt));
    setAttachment(null);
    setKeepAttachmentName(job.attachmentName || null);
    setStatus(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    setStatus(null);

    if (recipients.length === 0) {
      setStatus({ type: 'error', text: 'Add at least one recipient email.' });
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setStatus({ type: 'error', text: 'Subject and message are both required.' });
      return;
    }
    if (mode === 'schedule') {
      if (!sendAt || new Date(sendAt).getTime() <= Date.now()) {
        setStatus({ type: 'error', text: 'Pick a send time in the future.' });
        return;
      }
    }

    setBusy(true);
    try {
      const editing = mode === 'schedule' && editingId;
      const endpoint = mode === 'now' ? '/api/send' : '/api/schedule';
      const body = {
        emails: recipients,
        subject,
        message,
        attachment, // null when editing without re-uploading → server keeps old file
        ...(editing ? { id: editingId } : {}),
        ...(mode === 'schedule' ? { sendAt: new Date(sendAt).toISOString() } : {}),
      };
      const res = await fetch(endpoint, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        // Build the confirmation on the client so the time shows in the user's
        // local timezone (the server runs in UTC on Vercel).
        let text = data.message;
        if (mode === 'schedule') {
          const when = new Date(sendAt).toLocaleString();
          text = editing
            ? `Schedule updated — ${recipients.length} emails will send on ${when}.`
            : `Scheduled ${recipients.length} emails for ${when}.`;
        }
        setStatus({ type: 'success', text });
        if (mode === 'now' || editing) resetForm();
        refreshJobs();
      } else {
        setStatus({ type: 'error', text: data.message || 'Something went wrong.' });
      }
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob(id) {
    await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' });
    if (editingId === id) resetForm();
    refreshJobs();
  }

  return (
    <main className="page">
      <div className="header">
        <div className="logo">✉️</div>
        <div>
          <h1>Automated Mail Sender</h1>
        </div>
      </div>
      <p className="subtitle">
        Send bulk emails instantly, or schedule them for the perfect moment.
      </p>

      <div className="grid">
        {/* Compose card */}
        <section className="card">
          <div className="toggle">
            <button
              className={mode === 'now' ? 'active' : ''}
              onClick={() => {
                setMode('now');
                setEditingId(null);
                setKeepAttachmentName(null);
              }}
              type="button"
            >
              Send now
            </button>
            <button
              className={mode === 'schedule' ? 'active' : ''}
              onClick={() => setMode('schedule')}
              type="button"
            >
              Schedule
            </button>
          </div>

          <label htmlFor="emails">
            Recipients{' '}
            <span className="hint">
              ({recipients.length} {recipients.length === 1 ? 'address' : 'addresses'})
            </span>
          </label>
          <textarea
            id="emails"
            rows={6}
            placeholder={'one@example.com\ntwo@example.com\nthree@example.com'}
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
          />

          <label htmlFor="subject">Subject</label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Your subject line"
          />

          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message…"
          />

          <label htmlFor="attachment">Attachment (optional)</label>
          <input id="attachment" type="file" onChange={handleFile} />
          {attachment && <p className="hint">Attached: {attachment.name}</p>}
          {!attachment && keepAttachmentName && (
            <p className="hint">
              Keeping: {keepAttachmentName} — choose a file to replace it.
            </p>
          )}

          {mode === 'schedule' && (
            <>
              <label htmlFor="sendAt">Send at</label>
              <input
                id="sendAt"
                type="datetime-local"
                value={sendAt}
                onChange={(e) => setSendAt(e.target.value)}
              />
            </>
          )}

          <button className="btn" onClick={handleSubmit} disabled={busy} type="button">
            {busy && <span className="spin" />}
            {busy
              ? editingId
                ? 'Updating…'
                : mode === 'now'
                ? 'Sending…'
                : 'Scheduling…'
              : editingId
              ? 'Update schedule'
              : mode === 'now'
              ? `Send to ${recipients.length || 0}`
              : 'Schedule emails'}
          </button>

          {editingId && (
            <button className="cancel" onClick={resetForm} type="button" style={{ width: '100%' }}>
              Cancel edit
            </button>
          )}

          {status && <div className={`status ${status.type}`}>{status.text}</div>}
        </section>

        {/* Scheduled jobs card */}
        <section className="card">
          <h2>
            Scheduled
            {persistent === false && (
              <span className="badge memory" title="In-memory store — schedules are lost on restart">
                in-memory
              </span>
            )}
            {persistent === true && (
              <span className="badge persistent" title="Persisted in Upstash Redis">
                persistent
              </span>
            )}
          </h2>

          {jobs.length === 0 ? (
            <div className="empty">No scheduled emails yet.</div>
          ) : (
            <div className="jobs">
              {jobs.map((job) => (
                <div className="job" key={job.id}>
                  <div className="job-top">
                    <div>
                      <p className="subject">{job.subject}</p>
                      <p className="meta">
                        {job.total} recipient{job.total === 1 ? '' : 's'} ·{' '}
                        {new Date(job.sendAt).toLocaleString()}
                      </p>
                      {(job.status === 'sent' || job.status === 'failed') && (
                        <p className="meta">
                          {job.sentCount} sent
                          {job.failedCount ? `, ${job.failedCount} failed` : ''}
                        </p>
                      )}
                    </div>
                    <span className={`status-pill ${job.status}`}>{job.status}</span>
                  </div>
                  {job.status === 'scheduled' && (
                    <div className="job-actions">
                      <button className="cancel" onClick={() => handleEdit(job)} type="button">
                        Edit
                      </button>
                      <button className="cancel" onClick={() => cancelJob(job.id)} type="button">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="footer">
        Built with Next.js + Nodemailer · scheduling via <code>/api/cron</code>
      </p>
    </main>
  );
}
