import { isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { readPhoto } from "@/lib/storage";

/** Photos are only visible to the logged-in owner. /api/photo/<event id> */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const c = await db();
  const row = await c.execute({ sql: "SELECT photo FROM events WHERE id = ?", args: [id] });
  const ref = row.rows[0]?.photo;
  const body = typeof ref === "string" ? await readPhoto(ref) : null;
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body as BodyInit, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
