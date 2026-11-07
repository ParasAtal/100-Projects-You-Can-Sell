import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, plain, today, type Task, type Worker } from "@/lib/db";
import { monthStandings } from "@/lib/leaderboard";
import WorkerApp from "./WorkerApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mera Kaam · KaamTrack",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function WorkerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) notFound();
  const c = await db();
  const worker = plain<Worker>(
    (await c.execute({ sql: "SELECT * FROM workers WHERE token = ? AND active = 1", args: [token] })).rows,
  )[0];
  if (!worker) notFound();

  const day = today();
  // Today's tasks, plus anything left running/paused from an earlier day.
  const tasks = plain<Task>(
    (
      await c.execute({
        sql: `SELECT * FROM tasks WHERE worker_id = ? AND (day = ? OR status IN ('running','paused'))
              ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'paused' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, id`,
        args: [worker.id, day],
      })
    ).rows,
  );
  const standing = (await monthStandings(day.slice(0, 7))).find((s) => s.worker.id === worker.id);

  return (
    <WorkerApp
      token={token}
      name={worker.name}
      initialTasks={tasks}
      points={standing?.points ?? 0}
    />
  );
}
