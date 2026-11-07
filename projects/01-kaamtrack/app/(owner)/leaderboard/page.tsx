import Link from "next/link";
import { today } from "@/lib/db";
import { monthStandings } from "@/lib/leaderboard";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const current = today().slice(0, 7);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : current;
  const rows = await monthStandings(month);
  const label = new Date(`${month}-01T12:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const reward = process.env.MONTHLY_REWARD;

  return (
    <>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h1>Leaderboard · {label}</h1>
        <div className="row">
          <Link className="btn sm" href={`/leaderboard?month=${shiftMonth(month, -1)}`}>← Prev</Link>
          {month !== current && <Link className="btn sm" href={`/leaderboard?month=${shiftMonth(month, 1)}`}>Next →</Link>}
        </div>
      </div>
      {reward && <div className="card"><strong>Reward:</strong> {reward}</div>}

      <section className="card scroll-x">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Worker</th>
              <th className="num">Points</th>
              <th className="num">On time</th>
              <th className="num">Approved</th>
              <th className="num">Rework</th>
              <th className="num">Worked / target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.worker.id} className={i === 0 && r.points > 0 ? "top" : undefined}>
                <td>{i === 0 && r.points > 0 ? "🏆" : i + 1}</td>
                <td>{r.worker.name}</td>
                <td className="num">{r.points}</td>
                <td className="num">{r.onTimePct == null ? "—" : `${r.onTimePct}%`}</td>
                <td className="num">{r.approved}/{r.done}</td>
                <td className="num">{r.rework}</td>
                <td className="num">{r.hoursWorked.toFixed(1)}h / {r.hoursTarget.toFixed(1)}h</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted">No finished tasks this month yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card small muted">
        <strong>How points work.</strong> Each approved task earns points per hour of its target:
        on target (90–110% of the time) = 10, faster (80–90%) = 12, a bit late (110–130%) = 6,
        late (130–160%) = 3, more than 160% = 0. Pauses for machine breakdowns, power cuts and missing
        material don&apos;t count against the worker. Tasks marked Rework earn 0. Finishing in under 80% of
        the target is flagged for you to check — usually the target was too loose.
      </section>
    </>
  );
}
