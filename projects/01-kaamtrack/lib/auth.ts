import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "kt_owner";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s === "dev-only-secret-change-me") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Set SESSION_SECRET to a long random string before running in production.");
    }
    return "dev-only-secret-change-me";
  }
  return s;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function checkPin(pin: string): boolean {
  const expected = process.env.OWNER_PIN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") throw new Error("Set OWNER_PIN before running in production.");
    return safeEqual(pin, "1234");
  }
  return safeEqual(pin, expected);
}

export async function startOwnerSession() {
  const value = `owner.${Date.now() + THIRTY_DAYS}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS / 1000,
    path: "/",
  });
}

export async function endOwnerSession() {
  (await cookies()).delete(COOKIE);
}

export async function isOwner(): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const i = raw.lastIndexOf(".");
  const value = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!safeEqual(sig, sign(value))) return false;
  const exp = Number(value.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now();
}

export async function requireOwner() {
  if (!(await isOwner())) redirect("/login");
}

export function newWorkerToken(): string {
  return crypto.randomBytes(12).toString("base64url");
}
