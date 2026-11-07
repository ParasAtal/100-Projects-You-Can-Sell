import { NextResponse } from "next/server";
import { db, plain, type Worker } from "@/lib/db";
import { ActionError, applyAction, PAUSE_REASONS, type Action } from "@/lib/engine";
import { deletePhoto, isJpeg, MAX_PHOTO_BYTES, savePhoto } from "@/lib/storage";

const ACTIONS: Action[] = ["start", "pause", "resume", "end"];
const STATUS: Record<string, number> = {
  not_found: 404,
  bad_state: 409,
  other_running: 409,
  photo_required: 400,
  reason_required: 400,
  bad_photo: 400,
  bad_request: 400,
};

function fail(code: string) {
  return NextResponse.json({ error: code }, { status: STATUS[code] ?? 400 });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return fail("not_found");

  const c = await db();
  const worker = plain<Worker>(
    (await c.execute({ sql: "SELECT * FROM workers WHERE token = ? AND active = 1", args: [token] })).rows,
  )[0];
  if (!worker) return fail("not_found");

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return fail("bad_request");
  }
  const action = String(fd.get("action")) as Action;
  const taskId = Number(fd.get("taskId"));
  const clientAt = Number(fd.get("clientAt"));
  const clientId = String(fd.get("clientId") ?? "");
  const reasonRaw = fd.get("reason");
  const reason = reasonRaw ? String(reasonRaw) : null;

  if (!ACTIONS.includes(action) || !taskId || !/^[A-Za-z0-9-]{8,64}$/.test(clientId)) return fail("bad_request");
  if (reason && !(PAUSE_REASONS as readonly string[]).includes(reason)) return fail("bad_request");

  // A retry of a tap we already saved: answer OK without storing the photo again.
  const dup = await c.execute({ sql: "SELECT 1 FROM events WHERE client_id = ?", args: [clientId] });
  if (dup.rows.length) return NextResponse.json({ ok: true, duplicate: true });

  let photo: string | null = null;
  const file = fd.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) return fail("bad_photo");
    const buf = Buffer.from(await file.arrayBuffer());
    if (!isJpeg(buf)) return fail("bad_photo");
    photo = await savePhoto(buf);
  }

  try {
    const task = await applyAction({ workerId: worker.id, taskId, action, clientAt, clientId, reason, photo });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    if (photo) await deletePhoto(photo); // tap was rejected — don't keep its photo
    if (e instanceof ActionError) return fail(e.code);
    throw e;
  }
}
