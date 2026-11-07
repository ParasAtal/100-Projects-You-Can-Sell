import "server-only";
import { db, plain, type Task, type TaskEvent } from "./db";

export type Action = "start" | "pause" | "resume" | "end";

export const PAUSE_REASONS = ["machine", "material", "power", "break", "instructed", "other"] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

const NEXT: Record<Action, { from: Task["status"][]; to: Task["status"] }> = {
  start: { from: ["pending"], to: "running" },
  pause: { from: ["running"], to: "paused" },
  resume: { from: ["paused"], to: "running" },
  end: { from: ["running", "paused"], to: "done" },
};

export class ActionError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Apply one worker action to a task.
 *
 * clientAt is when the worker tapped the button (the phone may have been offline,
 * so this can arrive late). We trust it within limits: never in the future, and
 * never earlier than the task's previous event, so time can't be rewound.
 * clientId makes retries safe: the same tap sent twice is applied once.
 */
export async function applyAction(opts: {
  workerId: number;
  taskId: number;
  action: Action;
  clientAt: number;
  clientId: string;
  reason?: string | null;
  photo?: string | null;
}): Promise<Task> {
  const c = await db();
  const now = Date.now();

  const dup = await c.execute({ sql: "SELECT id FROM events WHERE client_id = ?", args: [opts.clientId] });
  const taskRows = await c.execute({
    sql: "SELECT * FROM tasks WHERE id = ? AND worker_id = ?",
    args: [opts.taskId, opts.workerId],
  });
  const task = plain<Task>(taskRows.rows)[0];
  if (!task) throw new ActionError("not_found");
  if (dup.rows.length) return task; // already applied

  const rule = NEXT[opts.action];
  if (!rule.from.includes(task.status)) throw new ActionError("bad_state");

  if (opts.action === "start" || opts.action === "resume") {
    const other = await c.execute({
      sql: "SELECT id FROM tasks WHERE worker_id = ? AND status = 'running' AND id != ?",
      args: [opts.workerId, opts.taskId],
    });
    if (other.rows.length) throw new ActionError("other_running");
  }
  if ((opts.action === "start" || opts.action === "end") && !opts.photo) throw new ActionError("photo_required");
  if (opts.action === "pause" && !opts.reason) throw new ActionError("reason_required");

  const last = await c.execute({
    sql: "SELECT MAX(client_at) AS t FROM events WHERE task_id = ?",
    args: [task.id],
  });
  const lastAt = Number(last.rows[0]?.t ?? 0);
  const at = Math.max(Math.min(opts.clientAt || now, now), lastAt);

  let activeSec = task.active_sec;
  let lastResume = task.last_resume_at;
  let startedAt = task.started_at;
  let endedAt = task.ended_at;

  if (task.status === "running" && lastResume != null) {
    activeSec += Math.max(0, Math.round((at - lastResume) / 1000));
  }
  switch (opts.action) {
    case "start":
      startedAt = at;
      lastResume = at;
      break;
    case "resume":
      lastResume = at;
      break;
    case "pause":
      lastResume = null;
      break;
    case "end":
      lastResume = null;
      endedAt = at;
      break;
  }

  await c.batch(
    [
      {
        sql: `INSERT INTO events (task_id, type, reason, photo, client_at, server_at, client_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [task.id, opts.action, opts.reason ?? null, opts.photo ?? null, at, now, opts.clientId],
      },
      {
        sql: `UPDATE tasks SET status = ?, active_sec = ?, last_resume_at = ?, started_at = ?, ended_at = ?
              WHERE id = ?`,
        args: [rule.to, activeSec, lastResume, startedAt, endedAt, task.id],
      },
    ],
    "write",
  );

  return { ...task, status: rule.to, active_sec: activeSec, last_resume_at: lastResume, started_at: startedAt, ended_at: endedAt };
}

export async function eventsForTasks(taskIds: number[]): Promise<Map<number, TaskEvent[]>> {
  const map = new Map<number, TaskEvent[]>();
  if (!taskIds.length) return map;
  const c = await db();
  const res = await c.execute({
    sql: `SELECT * FROM events WHERE task_id IN (${taskIds.map(() => "?").join(",")}) ORDER BY client_at, id`,
    args: taskIds,
  });
  for (const e of plain<TaskEvent>(res.rows)) {
    const list = map.get(e.task_id) ?? [];
    list.push(e);
    map.set(e.task_id, list);
  }
  return map;
}
