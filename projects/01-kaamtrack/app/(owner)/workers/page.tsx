import { headers } from "next/headers";
import { db, plain, type Worker } from "@/lib/db";
import { addWorker, resetWorkerLink, setWorkerActive } from "../../actions";
import CopyButton from "./CopyButton";

export default async function WorkersPage() {
  const c = await db();
  const workers = plain<Worker>((await c.execute("SELECT * FROM workers ORDER BY active DESC, name")).rows);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${h.get("host")}`;

  return (
    <>
      <h1>Workers</h1>
      <section className="card">
        <h2>Add worker</h2>
        <form action={addWorker} className="row">
          <input name="name" required placeholder="Name" />
          <input name="phone" placeholder="WhatsApp number (optional)" inputMode="tel" />
          <button className="btn primary">Add</button>
        </form>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Each worker gets a private link. They open it on their phone — no app, no password.
        </p>
      </section>

      <section className="card">
        {workers.length === 0 && <p className="muted">No workers yet.</p>}
        {workers.map((w) => {
          const link = `${base}/w/${w.token}`;
          const msg = encodeURIComponent(`Namaste ${w.name}, aapke kaam ka link: ${link}\nKaam shuru karte waqt START dabayein aur photo lein.`);
          const wa = w.phone ? `https://wa.me/${w.phone.length === 10 ? "91" + w.phone : w.phone}?text=${msg}` : null;
          return (
            <div className="task" key={w.id} style={{ opacity: w.active ? 1 : 0.55 }}>
              <div className="row spread">
                <div>
                  <div className="title">{w.name} {!w.active && <span className="chip pending">inactive</span>}</div>
                  <div className="small muted" style={{ wordBreak: "break-all" }}>{link}</div>
                </div>
                <div className="row">
                  <CopyButton text={link} />
                  {wa && <a className="btn sm" href={wa} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
                  <a className="btn sm" href={`/w/${w.token}`} target="_blank">Open</a>
                  <form action={resetWorkerLink}>
                    <input type="hidden" name="id" value={w.id} />
                    <button className="btn sm" title="Old link stops working">New link</button>
                  </form>
                  <form action={setWorkerActive}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="active" value={w.active ? "0" : "1"} />
                    <button className="btn sm">{w.active ? "Deactivate" : "Activate"}</button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
