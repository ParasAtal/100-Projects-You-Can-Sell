export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtSec(sec: number): string {
  return fmtMin(Math.round(sec / 60));
}

/** 01:05:09 style, for the live timer */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((n) => String(n).padStart(2, "0")).join(":");
}

export function timeOf(ms: number, tz = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(ms));
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Working seconds so far, including the currently running stretch */
export function liveSec(t: { status: string; active_sec: number; last_resume_at: number | null }, now: number): number {
  return t.active_sec + (t.status === "running" && t.last_resume_at ? Math.max(0, (now - t.last_resume_at) / 1000) : 0);
}
