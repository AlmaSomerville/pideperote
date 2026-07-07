"use client";
import { useEffect, useState, useCallback } from "react";

const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";
const hhmm = (d) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export default function RepartoPage({ params }) {
  const [data, setData] = useState(null);
  const [gone, setGone] = useState(""); // "not_found" | "expired"
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reparto/${params.token}`, { cache: "no-store" });
      if (res.status === 404) return setGone("not_found");
      if (res.status === 410) return setGone("expired");
      if (res.ok) setData(await res.json());
    } catch {}
  }, [params.token]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    const onWake = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", onWake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [load]);

  async function doAction(action) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/reparto/${params.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      alert("Sin conexión. Vuelve a intentarlo.");
    }
    await load();
    setBusy(false);
  }

  if (gone)
    return (
      <main className="wrap confirm-box">
        <div className="big-icon">⏳</div>
        <h1>{gone === "expired" ? "Este enlace ha caducado" : "Enlace no válido"}</h1>
        <p className="muted">
          {gone === "expired"
            ? "Los enlaces de reparto valen 24 horas. Pide al restaurante que te lo reenvíe si lo necesitas."
            : "Puede que el pedido se haya reasignado a otro repartidor. Pregunta en el restaurante."}
        </p>
      </main>
    );

  if (!data) return <main className="wrap confirm-box"><p className="muted">Cargando pedido...</p></main>;

  const { order: o, items } = data;
  const picked = o.status === "en_camino";
  const done = o.status === "entregado";
  const cancelled = o.status === "rechazado";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`;

  return (
    <main className="wrap">
      <div className="topbar">
        <span className="wordmark">pideperote<span className="dot">.</span></span>
        <span className="tag">REPARTO · {o.courier_name}</span>
      </div>

      <div className="panel">
        <div className="order-head">
          <span className="order-code">{o.code}</span>
          <span className="tag">{o.restaurant_name}</span>
        </div>

        <div className="courier-steps">
          <span className={!done && !cancelled && !picked ? "on" : "done"}>1 · Recoger</span>
          <span className={picked ? "on" : done ? "done" : ""}>2 · En camino</span>
          <span className={done ? "on" : ""}>3 · Entregado</span>
        </div>

        <div className="courier-total">
          💶 Cobrar {eur(o.total_cents)}
          <small>en efectivo al entregar</small>
        </div>

        <div className="courier-dest">
          <b>{o.customer_name}</b>
          <div>📍 {o.address}</div>
          {o.notes && <div className="muted">📝 {o.notes}</div>}
        </div>

        <div className="courier-actions">
          <a className="btn secondary" href={mapsUrl} target="_blank" rel="noreferrer">🗺️ Abrir en Maps</a>
          <a className="btn secondary" href={`tel:${o.phone}`}>📞 Llamar al cliente</a>
        </div>

        <hr className="sep" />
        <b style={{ fontSize: 14 }}>Qué lleva ({items.reduce((s, it) => s + it.qty, 0)} uds):</b>
        <div className="order-items">
          {items.map((it, i) => (
            <div key={i}>
              <b>{it.qty}x {it.name}</b>
              {it.modifiers && <div className="mods">↳ {it.modifiers.split(" | ").join(", ")}</div>}
            </div>
          ))}
        </div>

        <hr className="sep" />
        {cancelled && (
          <p className="err" style={{ fontSize: 16, fontWeight: 700 }}>
            ❌ El restaurante ha cancelado este pedido. No hace falta llevarlo.
          </p>
        )}
        {!cancelled && !picked && !done && (
          <>
            <button className="btn green big" disabled={busy} onClick={() => doAction("recogido")}>
              ✅ He recogido el pedido
            </button>
            <p className="muted" style={{ textAlign: "center", marginBottom: 0 }}>
              Púlsalo al salir del restaurante: el cliente verá "En camino".
            </p>
          </>
        )}
        {picked && (
          <>
            <button className="btn big" disabled={busy} onClick={() => doAction("entregado")}>
              📦 Pedido entregado
            </button>
            <p className="muted" style={{ textAlign: "center", marginBottom: 0 }}>
              Recogido a las {o.picked_up_at ? hhmm(o.picked_up_at) : "--:--"} · púlsalo al entregar y cobrar.
            </p>
          </>
        )}
        {done && (
          <div className="confirm-box" style={{ padding: "10px 0" }}>
            <div className="big-icon">✅</div>
            <p className="status-now">Entregado{o.delivered_at ? ` a las ${hhmm(o.delivered_at)}` : ""}. ¡Gracias!</p>
          </div>
        )}
      </div>
    </main>
  );
}
