# 📧 Automated Mail Sender

Bulk email sender with **scheduling**, rebuilt on **Next.js + Nodemailer** and ready to deploy on **Vercel**.

- ✅ Send bulk emails instantly (batched to respect Gmail rate limits)
- ⏰ Schedule emails for a future date/time — survives restarts (Upstash Redis)
- 📎 Optional file attachments
- 📊 Live dashboard of scheduled / sent / failed jobs
- 🎨 Clean, modern dark UI

> Migrated from the original Express + static HTML version. The old `index.js`
> server is replaced by Next.js App Router API routes.

---

## How scheduling works (important)

Vercel is **serverless** — there is no always-on process, so an in-memory
`setTimeout` would not reliably fire a scheduled email. Instead:

1. A scheduled email is **saved to a store** (Upstash Redis).
2. A **cron** hits `/api/cron` every minute.
3. `/api/cron` sends any jobs whose time has arrived and updates their status.

Locally (without Upstash) the app falls back to an **in-memory store** plus a
30-second poller (`instrumentation.js`), so scheduling "just works" for dev —
but those schedules are lost on restart and won't work on serverless.

---

## 1. Local setup

```bash
npm install
cp .env.example .env        # then fill in the values
npm run dev                 # http://localhost:3000
```

### Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `EMAIL_USER` | ✅ | Your Gmail address |
| `EMAIL_APP_PASSWORD` | ✅ | A Gmail **App Password** ([create one](https://myaccount.google.com/apppasswords)) — not your login password |
| `UPSTASH_REDIS_REST_URL` | for prod | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | for prod | Upstash Redis REST token |
| `CRON_SECRET` | for prod | Random string protecting `/api/cron` |

Without the Upstash vars, the app runs fine locally on the in-memory store.

---

## 2. Set up Upstash Redis (free, for reliable scheduling)

1. Sign up at [console.upstash.com](https://console.upstash.com).
2. Create a **Redis** database (any region).
3. Open it → **REST API** → copy `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` into your env vars.

---

## 3. Deploy to Vercel

1. Push this branch and import the repo at [vercel.com/new](https://vercel.com/new).
2. Add the env vars from the table above in **Project → Settings → Environment Variables**
   (including `CRON_SECRET`).
3. Deploy.

### Triggering the cron

`vercel.json` already declares a cron on `/api/cron` every minute. Vercel
automatically calls it with the `Authorization: Bearer <CRON_SECRET>` header.

> ⚠️ **Vercel Hobby (free) plan runs cron jobs only once per day.** For
> minute-level scheduling on the free plan, use an external cron instead (next
> section). On the **Pro** plan, the built-in `vercel.json` cron runs every
> minute as-is.

### Free alternative: external cron (any plan)

Use a free service like [cron-job.org](https://cron-job.org):

- **URL:** `https://<your-app>.vercel.app/api/cron?secret=<CRON_SECRET>`
- **Schedule:** every 1 minute
- Method GET is fine.

That endpoint is safe to call repeatedly — it only sends jobs that are due, and
claims each job before sending so it can't double-send.

---

## API reference

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/send` | POST | Send to recipients immediately |
| `/api/schedule` | POST | Create a scheduled job |
| `/api/schedule` | GET | List all jobs |
| `/api/schedule?id=…` | DELETE | Cancel / delete a job |
| `/api/cron` | GET/POST | Process due jobs (cron-triggered, secret-protected) |

---

## Tech

Next.js 14 (App Router) · Nodemailer · Upstash Redis · deployed on Vercel.
