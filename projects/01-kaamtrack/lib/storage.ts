import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Where start/end photos live.
 *
 * - If BLOB_READ_WRITE_TOKEN is set (Vercel → Storage → Blob, created as *Private*),
 *   photos go to Vercel Blob. Vercel adds that variable for you when you connect the store.
 * - Otherwise they are saved to a folder on disk (UPLOAD_DIR, default data/uploads) —
 *   good for your laptop, a VPS, or a PC in the factory office.
 *
 * Either way the owner sees photos only through /api/photo/<id>, which checks the login.
 * The value stored in the database is a "ref": a file name, or "photos/<name>" for Blob.
 */
const DIR = () => path.resolve(process.env.UPLOAD_DIR || "data/uploads");
const LOCAL_RE = /^[0-9]+-[a-f0-9]{16}\.jpg$/;
const BLOB_RE = /^photos\/[0-9]+-[a-f0-9]{16}\.jpg$/;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export async function savePhoto(buf: Buffer): Promise<string> {
  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.jpg`;
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const res = await put(`photos/${name}`, buf, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
    });
    return res.pathname;
  }
  await fs.mkdir(DIR(), { recursive: true });
  await fs.writeFile(path.join(DIR(), name), buf);
  return name;
}

export async function deletePhoto(ref: string): Promise<void> {
  if (BLOB_RE.test(ref)) {
    const { del } = await import("@vercel/blob");
    await del(ref).catch(() => {});
    return;
  }
  if (!LOCAL_RE.test(ref)) return;
  await fs.rm(path.join(DIR(), ref), { force: true });
}

/** Returns the photo body, or null if missing. */
export async function readPhoto(ref: string): Promise<ReadableStream | Uint8Array | null> {
  if (BLOB_RE.test(ref)) {
    const { get } = await import("@vercel/blob");
    const res = await get(ref, { access: "private" }).catch(() => null);
    return res?.stream ?? null;
  }
  if (!LOCAL_RE.test(ref)) return null;
  try {
    return new Uint8Array(await fs.readFile(path.join(DIR(), ref)));
  } catch {
    return null;
  }
}
