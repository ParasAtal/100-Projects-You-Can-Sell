// Fills a separate demo database with a month of realistic factory data,
// so you can see the dashboard and leaderboard working in 10 seconds.
//
//   npm run demo
//
// It never touches your real database (it writes to data/demo.db).

import { createClient } from "@libsql/client";
import crypto from "node:crypto";
import fs from "node:fs";

fs.mkdirSync("data", { recursive: true });
const url = "file:data/demo.db";
if (fs.existsSync("data/demo.db")) fs.rmSync("data/demo.db");
const db = createClient({ url });

await db.batch(
  [
    `CREATE TABLE workers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, token TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`,
    `CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL, title TEXT NOT NULL, expected_min INTEGER NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', quality TEXT, active_sec INTEGER NOT NULL DEFAULT 0, last_resume_at INTEGER, started_at INTEGER, ended_at INTEGER, created_at INTEGER NOT NULL)`,
    `CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, type TEXT NOT NULL, reason TEXT, photo TEXT, client_at INTEGER NOT NULL, server_at INTEGER NOT NULL, client_id TEXT UNIQUE)`,
  ],
  "write",
);

// deterministic "random" so every demo looks the same
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const TZ = "Asia/Kolkata";
const dayOf = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
const now = Date.now();
const today = dayOf(now);

const workers = [
  ["Ramesh Kumar", 1.0],
  ["Suresh Reddy", 1.15],
  ["Imran Ali", 0.97],
  ["Bikash Das", 1.3],
  ["Venkat Rao", 1.05],
  ["Mukesh Yadav", 1.2],
];
const jobs = [
  ["Cut 40 planks, 6 ft", 60],
  ["Plane & smooth door frames", 90],
  ["Drill hinge holes — batch of 30", 45],
  ["Assemble 4 cabinet carcasses", 120],
  ["Sand + polish table tops", 75],
  ["Load truck — order #A-214", 30],
  ["CNC routing: panel designs", 150],
  ["Edge banding — 25 shelves", 60],
  ["Machine oiling & cleaning", 30],
  ["Pack & label 20 chairs", 45],
];

const ids = [];
for (const [name] of workers) {
  const r = await db.execute({
    sql: "INSERT INTO workers (name, phone, token, created_at) VALUES (?, ?, ?, ?)",
    args: [name, null, crypto.randomBytes(12).toString("base64url"), now],
  });
  ids.push(Number(r.lastInsertRowid));
}

// past days of this month: finished + checked tasks
const [y, m, d] = today.split("-").map(Number);
for (let day = 1; day < d; day++) {
  const ds = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (new Date(`${ds}T12:00:00Z`).getUTCDay() === 0) continue; // Sunday off
  for (let w = 0; w < workers.length; w++) {
    for (let k = 0; k < 3; k++) {
      const [title, exp] = pick(jobs);
      const ratio = Math.max(0.75, workers[w][1] + (rnd() - 0.5) * 0.4);
      const active = Math.round(exp * 60 * ratio);
      const start = Date.parse(`${ds}T03:30:00Z`) + k * 3 * 3600_000;
      const quality = rnd() < 0.07 ? "rework" : "ok";
      await db.execute({
        sql: `INSERT INTO tasks (worker_id, title, expected_min, day, status, quality, active_sec, started_at, ended_at, created_at)
              VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?, ?)`,
        args: [ids[w], title, exp, ds, quality, active, start, start + active * 1000, start],
      });
    }
  }
}

// today: a live-looking floor
const ev = (taskId, type, at, reason = null) =>
  db.execute({
    sql: "INSERT INTO events (task_id, type, reason, photo, client_at, server_at, client_id) VALUES (?, ?, ?, NULL, ?, ?, ?)",
    args: [taskId, type, reason, at, at, crypto.randomUUID()],
  });
const add = async (w, title, exp, fields = {}) => {
  const f = { status: "pending", quality: null, active_sec: 0, last_resume_at: null, started_at: null, ended_at: null, ...fields };
  const r = await db.execute({
    sql: `INSERT INTO tasks (worker_id, title, expected_min, day, status, quality, active_sec, last_resume_at, started_at, ended_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [ids[w], title, exp, today, f.status, f.quality, f.active_sec, f.last_resume_at, f.started_at, f.ended_at, now],
  });
  return Number(r.lastInsertRowid);
};
const M = 60_000;

let t = await add(0, "Cut 40 planks, 6 ft", 60, { status: "done", quality: "ok", active_sec: 57 * 60, started_at: now - 150 * M, ended_at: now - 93 * M });
await ev(t, "start", now - 150 * M); await ev(t, "end", now - 93 * M);
t = await add(0, "Drill hinge holes — batch of 30", 45, { status: "running", active_sec: 0, last_resume_at: now - 38 * M, started_at: now - 38 * M });
await ev(t, "start", now - 38 * M);
t = await add(1, "Assemble 4 cabinet carcasses", 120, { status: "paused", active_sec: 64 * 60, started_at: now - 95 * M });
await ev(t, "start", now - 95 * M); await ev(t, "pause", now - 31 * M, "material");
t = await add(2, "CNC routing: panel designs", 150, { status: "running", active_sec: 0, last_resume_at: now - 72 * M, started_at: now - 72 * M });
await ev(t, "start", now - 72 * M);
t = await add(3, "Load truck — order #A-214", 30, { status: "done", active_sec: 52 * 60, started_at: now - 120 * M, ended_at: now - 68 * M });
await ev(t, "start", now - 120 * M); await ev(t, "end", now - 68 * M);
t = await add(4, "Sand + polish table tops", 75, { status: "running", active_sec: 0, last_resume_at: now - 20 * M, started_at: now - 20 * M });
await ev(t, "start", now - 20 * M);
await add(4, "Pack & label 20 chairs", 45);
await add(5, "Edge banding — 25 shelves", 60);
await add(5, "Machine oiling & cleaning", 30);

const first = await db.execute({ sql: "SELECT token FROM workers WHERE id = ?", args: [ids[0]] });
console.log(`Demo data ready in data/demo.db
Start it with:   npm run dev:demo
Owner PIN:       see OWNER_PIN in .env.local (1234 if unset)
Worker screen:   http://localhost:3000/w/${first.rows[0].token}`);
