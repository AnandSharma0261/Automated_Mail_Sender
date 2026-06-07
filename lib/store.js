import { Redis } from '@upstash/redis';

/**
 * Storage abstraction for scheduled email jobs.
 *
 * - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, jobs are
 *   persisted in Upstash Redis. This is required for reliable scheduling on
 *   Vercel, where each serverless invocation is stateless.
 * - Otherwise it falls back to an in-memory store. Good enough for local dev,
 *   but schedules are lost on restart and will NOT work on serverless hosts.
 *
 * A job shape:
 * {
 *   id, subject, message, emails: string[], attachment: {name,data}|null,
 *   sendAt: number (epoch ms), status: 'scheduled'|'sending'|'sent'|'failed',
 *   createdAt: number, total: number, sentCount: number, failedCount: number,
 *   error: string|null
 * }
 */

const INDEX_KEY = 'jobs:index'; // sorted set: score = sendAt, member = id
const jobKey = (id) => `job:${id}`;

const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

// ── Upstash-backed store ───────────────────────────────────────────────────
function redisStore() {
  const redis = Redis.fromEnv();

  return {
    backend: 'upstash',
    async create(job) {
      await redis.set(jobKey(job.id), job);
      await redis.zadd(INDEX_KEY, { score: job.sendAt, member: job.id });
      return job;
    },
    async get(id) {
      return (await redis.get(jobKey(id))) || null;
    },
    async update(id, patch) {
      const job = await this.get(id);
      if (!job) return null;
      const next = { ...job, ...patch };
      await redis.set(jobKey(id), next);
      if (patch.sendAt !== undefined) {
        await redis.zadd(INDEX_KEY, { score: patch.sendAt, member: id });
      }
      return next;
    },
    async remove(id) {
      await redis.del(jobKey(id));
      await redis.zrem(INDEX_KEY, id);
    },
    async list() {
      const ids = await redis.zrange(INDEX_KEY, 0, -1);
      if (!ids.length) return [];
      const jobs = await Promise.all(ids.map((id) => this.get(id)));
      return jobs.filter(Boolean);
    },
    async due(now) {
      const ids = await redis.zrange(INDEX_KEY, 0, now, { byScore: true });
      if (!ids.length) return [];
      const jobs = await Promise.all(ids.map((id) => this.get(id)));
      return jobs.filter((j) => j && j.status === 'scheduled');
    },
  };
}

// ── In-memory fallback (persisted across hot reloads) ──────────────────────
function memoryStore() {
  if (!globalThis.__jobStore) globalThis.__jobStore = new Map();
  const map = globalThis.__jobStore;

  return {
    backend: 'memory',
    async create(job) {
      map.set(job.id, job);
      return job;
    },
    async get(id) {
      return map.get(id) || null;
    },
    async update(id, patch) {
      const job = map.get(id);
      if (!job) return null;
      const next = { ...job, ...patch };
      map.set(id, next);
      return next;
    },
    async remove(id) {
      map.delete(id);
    },
    async list() {
      return [...map.values()].sort((a, b) => a.sendAt - b.sendAt);
    },
    async due(now) {
      return [...map.values()].filter(
        (j) => j.status === 'scheduled' && j.sendAt <= now
      );
    },
  };
}

let _store = null;
export function getStore() {
  if (!_store) _store = hasUpstash ? redisStore() : memoryStore();
  return _store;
}

export const usingPersistentStore = hasUpstash;
