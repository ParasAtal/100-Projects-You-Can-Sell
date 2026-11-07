"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/db";
import { clock, fmtMin, liveSec } from "@/lib/format";
import { LANGS, STRINGS, type Lang } from "@/lib/i18n";

type Action = "start" | "pause" | "resume" | "end";
type Queued = {
  clientId: string;
  taskId: number;
  action: Action;
  clientAt: number;
  reason?: string;
  photo?: string; // jpeg data URL
};

const REASON_KEYS = ["machine", "material", "power", "break", "instructed", "other"] as const;

/* ---------- tiny storage helpers (phone may block storage; app must still work) ---------- */
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full or blocked — queue still lives in memory */
  }
}

/** Same rules as the server, so the screen updates instantly even with no internet. */
function applyLocal(tasks: Task[], q: Queued): Task[] {
  return tasks.map((t) => {
    if (t.id !== q.taskId) return t;
    let active = t.active_sec;
    if (t.status === "running" && t.last_resume_at) active += Math.max(0, Math.round((q.clientAt - t.last_resume_at) / 1000));
    switch (q.action) {
      case "start":
        return t.status === "pending" ? { ...t, status: "running", started_at: q.clientAt, last_resume_at: q.clientAt } : t;
      case "resume":
        return t.status === "paused" ? { ...t, status: "running", last_resume_at: q.clientAt } : t;
      case "pause":
        return t.status === "running" ? { ...t, status: "paused", active_sec: active, last_resume_at: null } : t;
      case "end":
        return t.status === "running" || t.status === "paused"
          ? { ...t, status: "done", active_sec: active, last_resume_at: null, ended_at: q.clientAt }
          : t;
    }
  });
}

/** Shrink the camera photo to ~100 KB and burn the time + task name into it. */
async function compress(file: File, caption: string): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const fs = Math.max(14, Math.round(w / 32));
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(0, h - fs * 2, w, fs * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    ctx.fillText(caption, fs / 2, h - fs * 0.65, w - fs);
    return canvas.toDataURL("image/jpeg", 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: head.match(/:(.*?);/)?.[1] ?? "image/jpeg" });
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function WorkerApp({
  token,
  name,
  initialTasks,
  points,
}: {
  token: string;
  name: string;
  initialTasks: Task[];
  points: number;
}) {
  const router = useRouter();
  const qKey = `kt_queue_${token}`;
  const [lang, setLang] = useState<Lang>("hi");
  const [queue, setQueue] = useState<Queued[]>([]);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pausing, setPausing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const photoFor = useRef<{ taskId: number; action: "start" | "end"; title: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const syncing = useRef(false);
  const queueRef = useRef<Queued[]>([]);
  const t = STRINGS[lang];

  // restore saved language + any taps that never reached the server
  useEffect(() => {
    setLang(load<Lang>("kt_lang", "hi"));
    const saved = load<Queued[]>(qKey, []);
    queueRef.current = saved;
    setQueue(saved);
    setOnline(navigator.onLine);
  }, [qKey]);

  // server data is the truth once everything is sent; until then, layer pending taps on top
  useEffect(() => {
    setTasks(queueRef.current.reduce(applyLocal, initialTasks));
  }, [initialTasks]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const setQ = useCallback(
    (next: Queued[]) => {
      queueRef.current = next;
      setQueue(next);
      save(qKey, next);
    },
    [qKey],
  );

  const flush = useCallback(async () => {
    if (syncing.current || !queueRef.current.length) return;
    syncing.current = true;
    let sentAny = false;
    try {
      while (queueRef.current.length) {
        const item = queueRef.current[0];
        const fd = new FormData();
        fd.set("taskId", String(item.taskId));
        fd.set("action", item.action);
        fd.set("clientAt", String(item.clientAt));
        fd.set("clientId", item.clientId);
        if (item.reason) fd.set("reason", item.reason);
        if (item.photo) fd.set("photo", dataUrlToBlob(item.photo), "photo.jpg");
        let res: Response;
        try {
          res = await fetch(`/api/w/${token}/action`, { method: "POST", body: fd });
        } catch {
          setOnline(false);
          break; // no network — try again later
        }
        setOnline(true);
        if (res.status >= 500) break; // server trouble — keep it, retry later
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error === "other_running" ? "otherRunning" : body.error === "photo_required" ? "photoRequired" : "failed");
        }
        setQ(queueRef.current.slice(1));
        sentAny = true;
      }
    } finally {
      syncing.current = false;
    }
    if (sentAny) router.refresh();
  }, [router, setQ, token]);

  // retry: on reconnect, every 15 s, and whenever the app comes back to the foreground
  useEffect(() => {
    flush();
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        flush();
        router.refresh();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(flush, 15000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [flush, router]);

  function enqueue(item: Omit<Queued, "clientId" | "clientAt">) {
    const q: Queued = { ...item, clientId: uid(), clientAt: Date.now() };
    setError(null);
    setTasks((cur) => applyLocal(cur, q));
    setQ([...queueRef.current, q]);
    void flush();
  }

  function otherRunning(id: number) {
    return tasks.some((x) => x.status === "running" && x.id !== id);
  }

  function askPhoto(task: Task, action: "start" | "end") {
    if (action === "start" && otherRunning(task.id)) {
      setError("otherRunning");
      return;
    }
    photoFor.current = { taskId: task.id, action, title: task.title };
    fileInput.current?.click();
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = photoFor.current;
    photoFor.current = null;
    if (!file || !target) return;
    setBusy(true);
    try {
      const stamp = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      const photo = await compress(file, `${target.action.toUpperCase()} · ${name} · ${target.title} · ${stamp}`);
      enqueue({ taskId: target.taskId, action: target.action, photo });
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  function changeLang(l: Lang) {
    setLang(l);
    save("kt_lang", l);
  }

  const open = tasks.filter((x) => x.status !== "done");
  const finished = tasks.filter((x) => x.status === "done");

  return (
    <div>
      <header className="w-head">
        <div className="row">
          <div>
            <div className="small" style={{ opacity: 0.85 }}>{t.hello},</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{name}</div>
          </div>
          <select value={lang} onChange={(e) => changeLang(e.target.value as Lang)} aria-label="Language">
            {Object.entries(LANGS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
          {t.points}: <strong>{points}</strong>
        </div>
      </header>

      {(!online || queue.length > 0) && (
        <div className="banner warn">{online ? t.syncing : t.offline} ({queue.length})</div>
      )}
      {error && (
        <div className="banner err" onClick={() => setError(null)}>
          {(t as unknown as Record<string, string>)[error] ?? t.failed}
        </div>
      )}

      <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />

      <main className="wrap narrow">
        <h2 style={{ marginTop: 6 }}>{t.todayTasks}</h2>
        {tasks.length === 0 && <p className="muted">{t.noTasks}</p>}

        {open.map((task) => {
          const sec = liveSec(task, now);
          const over = sec / 60 > task.expected_min;
          return (
            <div key={task.id} className={`w-task ${task.status}`}>
              <div className="row spread">
                <h3>{task.title}</h3>
                <span className={`chip ${task.status}`}>{t[task.status as "pending" | "running" | "paused"]}</span>
              </div>
              <div className="muted">{t.target}: <strong>{fmtMin(task.expected_min)}</strong></div>

              {task.status !== "pending" && (
                <div className={`w-timer ${over ? "over" : ""}`}>{clock(sec)}</div>
              )}

              {pausing === task.id ? (
                <div className="stack" style={{ marginTop: 10 }}>
                  <strong>{t.whyPause}</strong>
                  <div className="w-reasons">
                    {REASON_KEYS.map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          setPausing(null);
                          enqueue({ taskId: task.id, action: "pause", reason: r });
                        }}
                      >
                        {t.reasons[r]}
                      </button>
                    ))}
                  </div>
                  <button className="btn" onClick={() => setPausing(null)}>{t.cancel}</button>
                </div>
              ) : (
                <div className="stack" style={{ marginTop: 12 }}>
                  {task.status === "pending" && (
                    <>
                      <button className="w-big go" disabled={busy} onClick={() => askPhoto(task, "start")}>📷 {t.start}</button>
                      <div className="small muted">{t.startHint}</div>
                    </>
                  )}
                  {task.status === "running" && (
                    <>
                      <button className="w-big stop" disabled={busy} onClick={() => askPhoto(task, "end")}>📷 {t.end}</button>
                      <button className="w-big hold" onClick={() => setPausing(task.id)}>⏸ {t.pause}</button>
                    </>
                  )}
                  {task.status === "paused" && (
                    <>
                      <button
                        className="w-big go"
                        onClick={() => (otherRunning(task.id) ? setError("otherRunning") : enqueue({ taskId: task.id, action: "resume" }))}
                      >
                        ▶ {t.resume}
                      </button>
                      <button className="w-big stop" disabled={busy} onClick={() => askPhoto(task, "end")}>📷 {t.end}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {finished.length > 0 && (
          <div className="card">
            {finished.map((task) => (
              <div key={task.id} className="row spread task">
                <div>
                  <div className="title">✅ {task.title}</div>
                  <div className="small muted">
                    {t.worked} {fmtMin(Math.round(task.active_sec / 60))} / {t.target} {fmtMin(task.expected_min)}
                  </div>
                </div>
                {task.quality && (
                  <span className={`chip ${task.quality === "ok" ? "good" : "bad"}`}>
                    {task.quality === "ok" ? t.qualityOk : t.qualityRework}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
