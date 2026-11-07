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

type Holder = { client?: Client; ready?: Promise<unknown> };
const g = globalThis as unknown as { __kaamtrack?: Holder };
const holder: Holder = (g.__kaamtrack ??= {});

export async function db(): Promise<Client> {
  if (!holder.client) {
    const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:data/kaamtrack.db";
    if (url.startsWith("file:")) {
      fs.mkdirSync(path.dirname(path.resolve(url.slice(5))), { recursive: true });
    }
    holder.client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN });
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
