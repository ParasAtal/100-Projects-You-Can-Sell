import "server-only";
import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/**
 * One SQLite/libSQL database. Locally it is a file (data/kaamtrack.db);
 * in production point DATABASE_URL at Turso (libsql://...) and nothing else changes.
 * All times are stored as Unix milliseconds.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     phone TEXT,
     token TEXT NOT NULL UNIQUE,
     active INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     worker_id INTEGER NOT NULL REFERENCES workers(id),
     title TEXT NOT NULL,
     expected_min INTEGER NOT NULL,
     day TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     quality TEXT,
     active_sec INTEGER NOT NULL DEFAULT 0,
     last_resume_at INTEGER,
     started_at INTEGER,
     ended_at INTEGER,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS tasks_day ON tasks(day)`,
  `CREATE INDEX IF NOT EXISTS tasks_worker_day ON tasks(worker_id, day)`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id),
     type TEXT NOT NULL,
     reason TEXT,
     photo TEXT,
     client_at INTEGER NOT NULL,
     server_at INTEGER NOT NULL,
     client_id TEXT UNIQUE
   )`,
  `CREATE INDEX IF NOT EXISTS events_task ON events(task_id)`,
];

/**
 * DATABASE_URL (+ DATABASE_AUTH_TOKEN) wins. Otherwise use the variables Vercel's Turso
 * integration creates, whatever prefix was chosen: <PREFIX>_TURSO_DATABASE_URL / _TURSO_AUTH_TOKEN.
 */
function dbConfig(): { url: string; authToken?: string } {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN };
  }
  const key = Object.keys(process.env).find((k) => k.endsWith("TURSO_DATABASE_URL"));
  if (key) {
    const prefix = key.slice(0, -"TURSO_DATABASE_URL".length);
    return { url: process.env[key]!, authToken: process.env[`${prefix}TURSO_AUTH_TOKEN`] };
  }
  if (process.env.VERCEL) throw new Error("No database configured: connect Turso in Vercel → Storage.");
  return { url: "file:data/kaamtrack.db" };
}

type Holder = { client?: Client; ready?: Promise<unknown> };
const g = globalThis as unknown as { __kaamtrack?: Holder };
const holder: Holder = (g.__kaamtrack ??= {});

export async function db(): Promise<Client> {
  if (!holder.client) {
    const { url, authToken } = dbConfig();
    if (url.startsWith("file:")) {
      fs.mkdirSync(path.dirname(path.resolve(url.slice(5))), { recursive: true });
    }
    holder.client = createClient({ url, authToken });
    holder.ready = holder.client.batch(SCHEMA, "write");
  }
  await holder.ready;
  return holder.client;
}

export type Worker = {
  id: number;
  name: string;
  phone: string | null;
  token: string;
  active: number;
};

export type TaskStatus = "pending" | "running" | "paused" | "done";
export type Quality = "ok" | "rework" | null;

export type Task = {
  id: number;
  worker_id: number;
  title: string;
  expected_min: number;
  day: string;
  status: TaskStatus;
  quality: Quality;
  active_sec: number;
  last_resume_at: number | null;
  started_at: number | null;
  ended_at: number | null;
};

export type TaskEvent = {
  id: number;
  task_id: number;
  type: "start" | "pause" | "resume" | "end";
  reason: string | null;
  photo: string | null;
  client_at: number;
  server_at: number;
};

/** libSQL rows are array-like objects; turn them into plain objects that can cross to client components. */
export function plain<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) }) as T);
}

/** "today" in the factory's timezone, as YYYY-MM-DD */
export function today(): string {
  return dayOf(Date.now());
}

export function dayOf(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata",
  }).format(new Date(ms));
}
