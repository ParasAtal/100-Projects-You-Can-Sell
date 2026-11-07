"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPin, endOwnerSession, newWorkerToken, requireOwner, startOwnerSession } from "@/lib/auth";
import { db, today } from "@/lib/db";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export async function login(_prev: string | null, fd: FormData): Promise<string | null> {
  await new Promise((r) => setTimeout(r, 400)); // slow down PIN guessing
  if (!checkPin(str(fd, "pin", 32))) return "Wrong PIN";
  await startOwnerSession();
  redirect("/");
}

export async function logout() {
  await endOwnerSession();
  redirect("/login");
}

export async function addWorker(fd: FormData) {
  await requireOwner();
  const name = str(fd, "name", 60);
  const phone = str(fd, "phone", 15).replace(/[^0-9]/g, "");
  if (!name) return;
  const c = await db();
  await c.execute({
    sql: "INSERT INTO workers (name, phone, token, created_at) VALUES (?, ?, ?, ?)",
    args: [name, phone || null, newWorkerToken(), Date.now()],
  });
  revalidatePath("/workers");
  revalidatePath("/");
}

export async function setWorkerActive(fd: FormData) {
  await requireOwner();
  const c = await db();
  await c.execute({
    sql: "UPDATE workers SET active = ? WHERE id = ?",
    args: [str(fd, "active") === "1" ? 1 : 0, Number(str(fd, "id"))],
  });
  revalidatePath("/workers");
  revalidatePath("/");
}

/** New link — the old one stops working (use if a phone is lost or a link is shared). */
export async function resetWorkerLink(fd: FormData) {
  await requireOwner();
  const c = await db();
  await c.execute({
    sql: "UPDATE workers SET token = ? WHERE id = ?",
    args: [newWorkerToken(), Number(str(fd, "id"))],
  });
  revalidatePath("/workers");
}

export async function addTask(fd: FormData) {
  await requireOwner();
  const workerId = Number(str(fd, "worker_id"));
  const title = str(fd, "title", 120);
  const hours = Number(str(fd, "hours")) || 0;
  const mins = Number(str(fd, "mins")) || 0;
  const expected = Math.round(hours * 60 + mins);
  const day = DAY_RE.test(str(fd, "day")) ? str(fd, "day") : today();
  if (!workerId || !title || expected <= 0 || expected > 24 * 60) return;
  const c = await db();
  await c.execute({
    sql: "INSERT INTO tasks (worker_id, title, expected_min, day, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [workerId, title, expected, day, Date.now()],
  });
  revalidatePath("/");
}

export async function deleteTask(fd: FormData) {
  await requireOwner();
  const c = await db();
  // Only tasks nobody has started can be deleted, so the log can't be quietly erased.
  await c.execute({ sql: "DELETE FROM tasks WHERE id = ? AND status = 'pending'", args: [Number(str(fd, "id"))] });
  revalidatePath("/");
}

export async function setQuality(fd: FormData) {
  await requireOwner();
  const q = str(fd, "quality");
  const c = await db();
  await c.execute({
    sql: "UPDATE tasks SET quality = ? WHERE id = ? AND status = 'done'",
    args: [q === "ok" || q === "rework" ? q : null, Number(str(fd, "id"))],
  });
  revalidatePath("/");
  revalidatePath("/leaderboard");
}

/** Copy yesterday's (or any day's) task list to another day, unstarted. Saves the owner typing every morning. */
export async function copyTasks(fd: FormData) {
  await requireOwner();
  const from = str(fd, "from");
  const to = str(fd, "to");
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from === to) return;
  const c = await db();
  await c.execute({
    sql: `INSERT INTO tasks (worker_id, title, expected_min, day, created_at)
          SELECT t.worker_id, t.title, t.expected_min, ?, ?
          FROM tasks t JOIN workers w ON w.id = t.worker_id
          WHERE t.day = ? AND w.active = 1`,
    args: [to, Date.now(), from],
  });
  revalidatePath("/");
}
