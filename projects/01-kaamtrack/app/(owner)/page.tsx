import Link from "next/link";
import { db, plain, today, type Task, type TaskEvent, type Worker } from "@/lib/db";
import { eventsForTasks } from "@/lib/engine";
import { fmtMin, fmtSec, liveSec, shiftDay, timeOf } from "@/lib/format";
import { STRINGS } from "@/lib/i18n";
import { BAND_LABEL, scoreTask } from "@/lib/scoring";
import { addTask, copyTasks, deleteTask, setQuality } from "../actions";
import AutoRefresh from "./AutoRefresh";

const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";
const REASONS = STRINGS.en.reasons as Record<string, string>;

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today();
  const c = await db();
  const workers = plain<Worker>((await c.execute("SELECT * FROM workers WHERE active = 1 ORDER BY name")).rows);
  const tasks = plain<Task>(
    (await c.execute({ sql: "SELECT * FROM tasks WHERE day = ? ORDER BY id", args: [day] })).rows,
  );
  const events = await eventsForTasks(tasks.map((t) => t.id));
  const now = Date.now();

  const allWorkers = plain<Worker>((await c.execute("SELECT * FROM workers ORDER BY name")).rows);
  const byWorker = new Map<number, Task[]>();
  for (const t of tasks) byWorker.set(t.worker_id, [...(byWorker.get(t.worker_id) ?? []), t]);

  const done = tasks.filter((t) => t.status === "done");
  const expectedDone = done.reduce((s, t) => s + t.expected_min, 0);
  const actualDone = done.reduce((s, t) => s + t.active_sec / 60, 0);
  const running = tasks.filter((t) => t.status === "running").length;
  const toReview = done.filter((t) => !t.quality).length;

  return (
    <>
      <AutoRefresh />
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h1>{day === today() ? "Today" : day}</h1>
        <div className="row">
          <Link className="btn sm" href={`/?day=${shiftDay(day, -1)}`}>← Prev</Link>
          {day !== today() && <Link className="btn sm" href="/">Today</Link>}
          <Link className="btn sm" href={`/?day=${shiftDay(day, 1)}`}>Next →</Link>
        </div>
      </div>

      <div className="card row spread">
        <Stat label="Tasks" value={`${done.length}/${tasks.length} done`} />
        <Stat label="Working now" value={String(running)} />
        <Stat
          label="Time vs target (done)"
          value={done.length ? `${fmtMin(actualDone)} / ${fmtMin(expectedDone)}` : "—"}
          bad={actualDone > expectedDone * 1.1}
        />
        <Stat label="Waiting for your check" value={String(toReview)} bad={toReview > 0} />
      </div>

      <section className="card">
        <h2>Add task</h2>
        {workers.length === 0 ? (
          <p className="muted">
            First <Link href="/workers">add your workers</Link>.
          </p>
        ) : (
          <form action={addTask} className="addtask">
            <input type="hidden" name="day" value={day} />
            <div>
              <label htmlFor="worker_id">Worker</label>
              <select id="worker_id" name="worker_id" required style={{ width: "100%" }}>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="wide">
              <label htmlFor="title">Task</label>
              <input id="title" name="title" required placeholder="e.g. Cut 40 planks, 6 ft" style={{ width: "100%" }} />
            </div>
            <div>
              <label htmlFor="hours">Hours</label>
              <input id="hours" name="hours" type="number" min="0" max="23" defaultValue="1" style={{ width: "100%" }} />
            </div>
            <div>
              <label htmlFor="mins">Minutes</label>
              <input id="mins" name="mins" type="number" min="0" max="59" step="5" defaultValue="0" style={{ width: "100%" }} />
            </div>
            <button className="btn primary">Add</button>
          </form>
        )}
        {tasks.length === 0 && workers.length > 0 && (
          <form action={copyTasks} className="row" style={{ marginTop: 10 }}>
            <input type="hidden" name="from" value={shiftDay(day, -1)} />
            <input type="hidden" name="to" value={day} />
            <button className="btn sm">Copy {shiftDay(day, -1)}&apos;s tasks to this day</button>
          </form>
        )}
      </section>

      {[...byWorker.entries()].map(([wid, list]) => {
        const w = allWorkers.find((x) => x.id === wid);
        return (
          <section className="card" key={wid}>
            <h2>{w?.name ?? "Unknown"}</h2>
            {list.map((t) => (
              <TaskRow key={t.id} task={t} events={events.get(t.id) ?? []} now={now} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className="small muted">{label}</div>
      <div style={{ fontWeight: 700, fontSize: "1.15rem" }} className={bad ? "over" : undefined}>{value}</div>
    </div>
  );
}

function TaskRow({ task: t, events, now }: { task: Task; events: TaskEvent[]; now: number }) {
  const worked = liveSec(t, now);
  const s = scoreTask(t);
  const over = worked / 60 > t.expected_min * 1.1; // red only once outside the on-target band
  const photos = events.filter((e) => e.photo);
  const lateSync = events.some((e) => e.server_at - e.client_at > 10 * 60 * 1000);

  return (
    <div className="task">
      <div className="row spread">
        <div>
          <div className="title">{t.title}</div>
          <div className="small muted">
            Target {fmtMin(t.expected_min)}
            {t.status !== "pending" && (
              <>
                {" · "}Worked <span className={over ? "over" : undefined}>{fmtSec(worked)}</span>
              </>
            )}
            {t.started_at && <> · {timeOf(t.started_at, TZ)}</>}
            {t.ended_at && <>–{timeOf(t.ended_at, TZ)}</>}
          </div>
        </div>
        <div className="row">
          <span className={`chip ${t.status}`}>{t.status === "running" ? "working" : t.status}</span>
          {s.band && (
            <span className={`chip ${s.flagged || s.band.includes("late") ? "bad" : "good"}`}>
              {BAND_LABEL[s.band]} · {Math.round((s.ratio ?? 0) * 100)}%
            </span>
          )}
        </div>
      </div>

      {events.some((e) => e.type === "pause") && (
        <ul className="log">
          {events
            .filter((e) => e.type === "pause")
            .map((e) => (
              <li key={e.id}>
                Paused {timeOf(e.client_at, TZ)} — {REASONS[e.reason ?? ""] ?? e.reason}
              </li>
            ))}
        </ul>
      )}
      {lateSync && <p className="small muted">Some taps were sent late (phone was offline).</p>}

      <div className="row spread" style={{ marginTop: 8 }}>
        <div className="thumbs">
          {photos.map((e) => (
            <a key={e.id} href={`/api/photo/${e.photo}`} target="_blank" title={`${e.type} ${timeOf(e.client_at, TZ)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photo/${e.photo}`} alt={`${e.type} photo`} loading="lazy" />
            </a>
          ))}
        </div>
        <div className="row">
          {t.status === "done" && (
            <>
              {t.quality ? (
                <span className={`chip ${t.quality === "ok" ? "good" : "bad"}`}>
                  {t.quality === "ok" ? `Approved · ${s.points} pts` : "Rework · 0 pts"}
                </span>
              ) : (
                <span className="small muted">{s.provisional} pts if approved</span>
              )}
              <form action={setQuality}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="quality" value="ok" />
                <button className="btn sm ok" disabled={t.quality === "ok"}>Quality OK</button>
              </form>
              <form action={setQuality}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="quality" value="rework" />
                <button className="btn sm no" disabled={t.quality === "rework"}>Rework</button>
              </form>
            </>
          )}
          {t.status === "pending" && (
            <form action={deleteTask}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn sm danger">Delete</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
