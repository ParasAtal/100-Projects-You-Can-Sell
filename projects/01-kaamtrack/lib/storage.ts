import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Photos are saved to a folder on disk (UPLOAD_DIR). That works on any VPS,
 * Railway/Render with a volume, or a PC in the factory office.
 * To use cloud storage instead, replace these two functions.
 */
const DIR = () => path.resolve(process.env.UPLOAD_DIR || "data/uploads");
const NAME_RE = /^[0-9]+-[a-f0-9]{16}\.jpg$/;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export async function savePhoto(buf: Buffer): Promise<string> {
  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.jpg`;
  await fs.mkdir(DIR(), { recursive: true });
  await fs.writeFile(path.join(DIR(), name), buf);
  return name;
}

export async function deletePhoto(name: string): Promise<void> {
  if (!NAME_RE.test(name)) return;
  await fs.rm(path.join(DIR(), name), { force: true });
}

export async function readPhoto(name: string): Promise<Buffer | null> {
  if (!NAME_RE.test(name)) return null;
  try {
    return await fs.readFile(path.join(DIR(), name));
  } catch {
    return null;
  }
}
