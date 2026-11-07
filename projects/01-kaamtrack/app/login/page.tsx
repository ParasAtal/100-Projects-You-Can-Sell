"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="wrap narrow" style={{ paddingTop: 80 }}>
      <div className="card stack">
        <h1>KaamTrack</h1>
        <p className="muted">Owner login</p>
        <form action={action} className="stack">
          <div>
            <label htmlFor="pin">PIN</label>
            <input id="pin" name="pin" type="password" inputMode="numeric" autoFocus required style={{ width: "100%" }} />
          </div>
          {error && <p className="chip bad">{error}</p>}
          <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
            {pending ? "Checking…" : "Open dashboard"}
          </button>
        </form>
      </div>
    </main>
  );
}
