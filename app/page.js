'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DRAFT_KEY = 'mailSenderDraft';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(text) {
  return text
    .split(/[\n,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

function isValidEmail(e) {
  return EMAIL_RE.test(e);
}

// Convert an epoch (ms) to the value <input type="datetime-local"> expects, in
// the user's LOCAL timezone.
function toLocalInput(ms) {
  const d = new Date(ms);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function defaultSendAt() {
  return toLocalInput(Date.now() + 10 * 60 * 1000); // 10 minutes from now
}

function formatBytes(b) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i > 0 && b < 10 ? 1 : 0)} ${u[i]}`;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'due now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `in ${d}d ${h}h`;
  if (h) return `in ${h}h ${m}m`;
  if (m) return `in ${m}m ${sec}s`;
  return `in ${sec}s`;
}

export default function Home() {
  const [mode, setMode] = useState('now'); // 'now' | 'schedule'
  const [emailsText, setEmailsText] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [fromName, setFromName] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [sendAt, setSendAt] = useState('');
  const [attachment, setAttachment] = useState(null); // { name, data, size }
  const [editingId, setEditingId] = useState(null);
  const [keepAttachmentName, setKeepAttachmentName] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [persistent, setPersistent] = useState(null);
  const [jobFilter, setJobFilter] = useState('all');
  const [now, setNow] = useState(0);

  const toastId = useRef(0);
  const fileRef = useRef(null);
  const loadedDraft = useRef(false);

  // ── Recipients: dedupe + validate ─────────────────────────────────────────
  const { unique, valid, invalid, dupCount } = useMemo(() => {
    const raw = parseEmails(emailsText);
    const seen = new Set();
    const unique = [];
    let dupCount = 0;
    for (const e of raw) {
      const key = e.toLowerCase();
      if (seen.has(key)) {
        dupCount += 1;
        continue;
      }
      seen.add(key);
      unique.push(e);
    }
    return {
      unique,
      valid: unique.filter(isValidEmail),
      invalid: unique.filter((e) => !isValidEmail(e)),
      dupCount,
    };
  }, [emailsText]);

  // ── Toasts ────────────────────────────────────────────────────────────────
  const toast = useCallback((type, text) => {
    const id = (toastId.current += 1);
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // ── Draft auto-save ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Load once on mount (also sets a sane default send time client-side).
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setEmailsText(d.emailsText || '');
        setSubject(d.subject || '');
        setMessage(d.message || '');
        setFromName(d.fromName || '');
        setCc(d.cc || '');
        setBcc(d.bcc || '');
        if (d.cc || d.bcc || d.fromName) setShowAdvanced(true);
      }
    } catch {
      /* ignore corrupt draft */
    }
    setSendAt(defaultSendAt());
    loadedDraft.current = true;
  }, []);

  useEffect(() => {
    if (!loadedDraft.current) return; // don't overwrite before initial load
    const d = { emailsText, subject, message, fromName, cc, bcc };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* storage full / unavailable */
    }
  }, [emailsText, subject, message, fromName, cc, bcc]);

  // ── Jobs polling + countdown tick ──────────────────────────────────────────
  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs);
        setPersistent(data.persistent);
      }
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    refreshJobs();
    const t = setInterval(refreshJobs, 10000);
    return () => clearInterval(t);
  }, [refreshJobs]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Attachment ──────────────────────────────────────────────────────────────
  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) =>
      setAttachment({ name: file.name, data: ev.target.result, size: file.size });
    reader.readAsDataURL(file);
    setKeepAttachmentName(null);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    readFile(e.dataTransfer.files?.[0]);
  }

  function removeEmail(email) {
    setEmailsText(unique.filter((e) => e.toLowerCase() !== email.toLowerCase()).join('\n'));
  }

  // ── Form lifecycle ────────────────────────────────────────────────────────
  function resetForm() {
    setEmailsText('');
    setSubject('');
    setMessage('');
    setFromName('');
    setCc('');
    setBcc('');
    setAttachment(null);
    setEditingId(null);
    setKeepAttachmentName(null);
    setSendAt(defaultSendAt());
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  function handleEdit(job) {
    setMode('schedule');
    setEditingId(job.id);
    setEmailsText((job.emails || []).join('\n'));
    setSubject(job.subject || '');
    setMessage(job.message || '');
    setFromName(job.fromName || '');
    setCc(job.cc || '');
    setBcc(job.bcc || '');
    if (job.fromName || job.cc || job.bcc) setShowAdvanced(true);
    setSendAt(toLocalInput(job.sendAt));
    setAttachment(null);
    setKeepAttachmentName(job.attachmentName || null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    if (valid.length === 0) {
      toast('error', 'Add at least one valid recipient email.');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast('error', 'Subject and message are both required.');
      return;
    }
    if (mode === 'schedule' && (!sendAt || new Date(sendAt).getTime() <= Date.now())) {
      toast('error', 'Pick a send time in the future.');
      return;
    }
    if (invalid.length) {
      toast('info', `${invalid.length} invalid address${invalid.length === 1 ? '' : 'es'} skipped.`);
    }

    setBusy(true);
    try {
      const editing = mode === 'schedule' && editingId;
      const endpoint = mode === 'now' ? '/api/send' : '/api/schedule';
      const body = {
        emails: valid,
        subject,
        message,
        fromName: fromName.trim() || undefined,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        attachment,
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
        if (mode === 'schedule') {
          const when = new Date(sendAt).toLocaleString();
          toast(
            'success',
            editing
              ? `Schedule updated — ${valid.length} emails on ${when}.`
              : `Scheduled ${valid.length} emails for ${when}.`
          );
        } else {
          toast('success', data.message);
        }
        if (mode === 'now' || editing) resetForm();
        refreshJobs();
      } else {
        toast('error', data.message || 'Something went wrong.');
      }
    } catch (err) {
      toast('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob(id) {
    await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' });
    if (editingId === id) resetForm();
    refreshJobs();
    toast('info', 'Scheduled job cancelled.');
  }

  // ── Jobs filtering ──────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { all: jobs.length, scheduled: 0, sent: 0, failed: 0 };
    for (const j of jobs) if (c[j.status] !== undefined) c[j.status] += 1;
    return c;
  }, [jobs]);

  const visibleJobs = useMemo(
    () => (jobFilter === 'all' ? jobs : jobs.filter((j) => j.status === jobFilter)),
    [jobs, jobFilter]
  );

  return (
    <main className="page">
      {/* Toasts */}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>

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
        {/* ── Compose ── */}
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

          <label htmlFor="emails">Recipients</label>
          <textarea
            id="emails"
            rows={4}
            placeholder={'one@example.com, two@example.com\nthree@example.com'}
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
          />
          {unique.length > 0 && (
            <>
              <div className="count-line">
                <span className="ok">{valid.length} valid</span>
                {invalid.length > 0 && <span className="bad">{invalid.length} invalid</span>}
                {dupCount > 0 && <span className="muted-pill">{dupCount} duplicate removed</span>}
              </div>
              <div className="chips">
                {unique.map((e) => (
                  <span
                    key={e}
                    className={`chip ${isValidEmail(e) ? '' : 'invalid'}`}
                    title={isValidEmail(e) ? e : 'Invalid email'}
                  >
                    {e}
                    <button onClick={() => removeEmail(e)} type="button" aria-label="remove">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}

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

          <button
            type="button"
            className="link-btn"
            onClick={() => setShowAdvanced((s) => !s)}
          >
            {showAdvanced ? '− Hide' : '+ Sender name, CC, BCC'}
          </button>
          {showAdvanced && (
            <div className="advanced">
              <label htmlFor="fromName">Sender name (optional)</label>
              <input
                id="fromName"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Anand Sharma"
              />
              <div className="two-col">
                <div>
                  <label htmlFor="cc">CC (optional)</label>
                  <input
                    id="cc"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="bcc">BCC (optional)</label>
                  <input
                    id="bcc"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@example.com"
                  />
                </div>
              </div>
            </div>
          )}

          <label>Attachment (optional)</label>
          <div
            className={`dropzone ${dragActive ? 'active' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            {attachment ? (
              <div className="file-row">
                <span>📎 {attachment.name}</span>
                <span className="muted">{formatBytes(attachment.size)}</span>
                <button
                  className="chip-x"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAttachment(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                >
                  ✕
                </button>
              </div>
            ) : keepAttachmentName ? (
              <span className="muted">Keeping: {keepAttachmentName} · click to replace</span>
            ) : (
              <span className="muted">Drag a file here, or click to browse</span>
            )}
          </div>

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
              ? `Send to ${valid.length}`
              : `Schedule ${valid.length} emails`}
          </button>
          {editingId && (
            <button className="cancel full" onClick={resetForm} type="button">
              Cancel edit
            </button>
          )}
        </section>

        {/* ── Right column: Preview + Jobs ── */}
        <div className="right-col">
          {/* Preview */}
          <section className="card">
            <h2>Preview</h2>
            <div className="preview">
              <div className="preview-row">
                <span className="pk">From</span>
                <span>{fromName ? `${fromName} <your Gmail>` : 'your Gmail'}</span>
              </div>
              <div className="preview-row">
                <span className="pk">To</span>
                <span>
                  {valid.length
                    ? `${valid[0]}${valid.length > 1 ? ` +${valid.length - 1} more` : ''}`
                    : '—'}
                </span>
              </div>
              {cc && (
                <div className="preview-row">
                  <span className="pk">Cc</span>
                  <span>{cc}</span>
                </div>
              )}
              <div className="preview-row">
                <span className="pk">Subject</span>
                <span className="psubj">{subject || '(no subject)'}</span>
              </div>
              <div className="preview-body">{message || 'Your message will appear here…'}</div>
              {(attachment || keepAttachmentName) && (
                <div className="preview-attach">📎 {attachment?.name || keepAttachmentName}</div>
              )}
            </div>
          </section>

          {/* Jobs */}
          <section className="card">
            <h2>
              Scheduled
              {persistent === false && (
                <span className="badge memory" title="In-memory — lost on restart">
                  in-memory
                </span>
              )}
              {persistent === true && (
                <span className="badge persistent" title="Persisted in Upstash Redis">
                  persistent
                </span>
              )}
            </h2>

            <div className="filters">
              {['all', 'scheduled', 'sent', 'failed'].map((f) => (
                <button
                  key={f}
                  className={`filter ${jobFilter === f ? 'active' : ''}`}
                  onClick={() => setJobFilter(f)}
                  type="button"
                >
                  {f[0].toUpperCase() + f.slice(1)} {counts[f] ? `(${counts[f]})` : ''}
                </button>
              ))}
            </div>

            {visibleJobs.length === 0 ? (
              <div className="empty">No {jobFilter === 'all' ? '' : jobFilter} jobs yet.</div>
            ) : (
              <div className="jobs">
                {visibleJobs.map((job) => {
                  const pct = job.total ? Math.round((job.sentCount / job.total) * 100) : 0;
                  const failPct = job.total ? Math.round((job.failedCount / job.total) * 100) : 0;
                  return (
                    <div className="job" key={job.id}>
                      <div className="job-top">
                        <div>
                          <p className="subject">{job.subject}</p>
                          <p className="meta">
                            {job.total} recipient{job.total === 1 ? '' : 's'} ·{' '}
                            {new Date(job.sendAt).toLocaleString()}
                          </p>
                          {job.status === 'scheduled' && now > 0 && (
                            <p className="meta countdown">⏱ {formatCountdown(job.sendAt - now)}</p>
                          )}
                          {(job.status === 'sent' || job.status === 'failed') && (
                            <p className="meta">
                              {job.sentCount} sent
                              {job.failedCount ? `, ${job.failedCount} failed` : ''}
                            </p>
                          )}
                        </div>
                        <span className={`status-pill ${job.status}`}>{job.status}</span>
                      </div>

                      {(job.status === 'sending' ||
                        job.status === 'sent' ||
                        job.status === 'failed') && (
                        <div className="progress">
                          <div className="bar ok" style={{ width: `${pct}%` }} />
                          <div className="bar bad" style={{ width: `${failPct}%` }} />
                        </div>
                      )}

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
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <p className="footer">
        Built with Next.js + Nodemailer · scheduling via <code>/api/cron</code>
      </p>
    </main>
  );
}
