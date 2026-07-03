"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";

export default function AdminPage() {
  const [authed, setAuthed] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [tab, setTab] = useState("restaurantes");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/restaurants");
    if (res.status === 401) return setAuthed(false);
    const d = await res.json();
    setRestaurants(d.restaurants);
    setAuthed(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (authed === null) return <main className="wrap"><p className="muted">Cargando...</p></main>;
  if (authed === false) return <AdminLogin onDone={load} />;

  return (
    <main className="wrap-wide">
      <div className="topbar">
        <Link href="/" className="wordmark">pideperote<span className="dot">.</span> <span className="tag">ADMIN</span></Link>
        <button className="btn ghost" onClick={async () => { await fetch("/api/portal/logout", { method: "POST" }); location.href = "/"; }}>Salir</button>
      </div>

      <div className="tabs">
        <button className={tab === "restaurantes" ? "on" : ""} onClick={() => setTab("restaurantes")}>Restaurantes</button>
        <button className={tab === "pedidos" ? "on" : ""} onClick={() => setTab("pedidos")}>Todos los pedidos</button>
      </div>

      {tab === "restaurantes" && <Restaurants restaurants={restaurants} reload={load} />}
      {tab === "pedidos" && <AllOrders />}
    </main>
  );
}

function AdminLogin({ onDone }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  async function login() {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    onDone();
  }
  return (
    <main className="wrap">
      <div className="login-box panel">
        <h3>Super admin</h3>
        <div className="field">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn green" onClick={login}>Entrar</button>
      </div>
    </main>
  );
}

function Restaurants({ restaurants, reload }) {
  const [form, setForm] = useState({ name: "", whatsapp: "", portalPassword: "" });
  const [err, setErr] = useState("");

  async function create() {
    setErr("");
    if (!form.name.trim()) return setErr("Falta el nombre.");
    const res = await fetch("/api/admin/restaurants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setForm({ name: "", whatsapp: "", portalPassword: "" });
    reload();
  }

  async function action(id, action) {
    await fetch("/api/admin/restaurants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    reload();
  }

  return (
    <>
      <div className="panel">
        <h3>Nuevo restaurante</h3>
        <div className="row2">
          <div className="field"><label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="field"><label>WhatsApp (avisos de pedidos)</label>
            <input value={form.whatsapp} placeholder="600123456" onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} /></div>
        </div>
        <div className="field"><label>Contraseña del portal (vacío = se genera sola)</label>
          <input value={form.portalPassword} onChange={(e) => setForm((f) => ({ ...f, portalPassword: e.target.value }))} /></div>
        {err && <p className="err">{err}</p>}
        <button className="btn green" onClick={create}>Crear restaurante</button>
      </div>

      {restaurants.map((r) => (
        <div className="panel" key={r.id} style={{ borderLeft: `8px solid ${r.color}` }}>
          <div className="list-row" style={{ borderBottom: "none" }}>
            <div className="color-dot" style={{ background: r.color }} />
            <div className="grow">
              <b>{r.name}</b> {!r.active && <span className="tag">Desactivado</span>}
              <div className="muted">
                /r/{r.slug} · portal: {r.slug} / {r.portal_password} · WhatsApp: {r.whatsapp || "—"}
              </div>
              <div className="muted">
                Últimos 30 días: {r.orders_30d} pedidos · {eur(Number(r.revenue_30d))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <Link href={`/portal?rid=${r.id}`} className="btn small">Entrar a su portal</Link>
            <Link href={`/r/${r.slug}`} className="btn small secondary">Ver carta</Link>
            <button className="btn small secondary" onClick={() => action(r.id, "toggleActive")}>
              {r.active ? "Desactivar" : "Activar"}
            </button>
            <button className="btn small danger" onClick={() => {
              if (confirm(`¿Borrar "${r.name}" con toda su carta y pedidos? No se puede deshacer.`))
                action(r.id, "delete");
            }}>Borrar</button>
          </div>
        </div>
      ))}
    </>
  );
}

function AllOrders() {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    let t;
    async function load() {
      const res = await fetch("/api/portal/orders");
      if (res.ok) setOrders((await res.json()).orders);
    }
    load();
    t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (!orders) return <p className="muted">Cargando...</p>;
  const total = orders.filter((o) => o.status !== "rechazado").reduce((s, o) => s + o.total_cents, 0);

  return (
    <>
      <p className="muted">{orders.length} pedidos en 48h · {eur(total)} en total</p>
      {orders.map((o) => (
        <div className="panel" key={o.id}>
          <div className="order-head">
            <span className="order-code">{o.code} · {o.restaurant_name} <span className="tag">{o.status}</span></span>
            <span className="order-time">{new Date(o.created_at).toLocaleString("es-ES")}</span>
          </div>
          <div className="muted">
            {o.items.map((it) => `${it.qty}x ${it.name}`).join(", ")} · {eur(o.total_cents)} ·{" "}
            {o.type === "reparto" ? o.address : "recogida"} · {o.customer_name} ({o.phone})
          </div>
        </div>
      ))}
    </>
  );
}
