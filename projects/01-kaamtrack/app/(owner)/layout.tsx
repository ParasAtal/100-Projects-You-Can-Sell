import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <>
      <nav className="nav">
        <div className="wrap">
          <Link href="/" className="logo">KaamTrack</Link>
          <Link href="/" className="tab">Today</Link>
          <Link href="/workers" className="tab">Workers</Link>
          <Link href="/leaderboard" className="tab">Leaderboard</Link>
          <form action={logout}>
            <button className="btn sm">Log out</button>
          </form>
        </div>
      </nav>
      <main className="wrap">{children}</main>
    </>
  );
}
