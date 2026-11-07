import { isOwner } from "@/lib/auth";
import { readPhoto } from "@/lib/storage";

/** Photos are only visible to the logged-in owner. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await isOwner())) return new Response("Unauthorized", { status: 401 });
  const { name } = await params;
  const buf = await readPhoto(name);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
