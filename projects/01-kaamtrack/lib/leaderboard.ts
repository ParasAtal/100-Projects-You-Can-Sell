import "server-only";
import { db, plain, type Task, type Worker } from "./db";
import { scoreTask } from "./scoring";

export type Standing = {
  worker: Pick<Worker, "id" | "name">;
  points: number;
  done: number;
  approved: number;
  rework: number;
  onTimePct: number | null; // share of approved tasks within 110% of target
  hoursTarget: number;
  hoursWorked: number;
};

/** month = "YYYY-MM" */
export async function monthStandings(month: string): Promise<Standing[]> {
  const c = await db();
  const workers = plain<Worker>((await c.execute("SELECT id, name, active FROM workers")).rows);
  const tasks = plain<Task>(
    (await c.execute({ sql: "SELECT * FROM tasks WHERE day LIKE ? AND status = 'done'", args: [`${month}-%`] })).rows,
  );

  const rows = new Map<number, Standing>();
  for (const w of workers) {
    rows.set(w.id, { worker: { id: w.id, name: w.name }, points: 0, done: 0, approved: 0, rework: 0, onTimePct: null, hoursTarget: 0, hoursWorked: 0 });
  }
  const onTime = new Map<number, number>();
  for (const t of tasks) {
    const r = rows.get(t.worker_id);
    if (!r) continue;
    const s = scoreTask(t);
    r.done++;
    r.points += s.points;
    r.hoursTarget += t.expected_min / 60;
    r.hoursWorked += t.active_sec / 3600;
    if (t.quality === "ok") {
      r.approved++;
      if ((s.ratio ?? 99) <= 1.1) onTime.set(t.worker_id, (onTime.get(t.worker_id) ?? 0) + 1);
    }
    if (t.quality === "rework") r.rework++;
  }
  for (const r of rows.values()) {
    r.points = Math.round(r.points * 10) / 10;
    r.onTimePct = r.approved ? Math.round(((onTime.get(r.worker.id) ?? 0) / r.approved) * 100) : null;
  }
  return [...rows.values()]
    .filter((r) => r.done > 0 || workers.find((w) => w.id === r.worker.id)?.active)
    .sort((a, b) => b.points - a.points || (b.onTimePct ?? 0) - (a.onTimePct ?? 0));
}
