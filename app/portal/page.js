"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";
const toCents = (s) => Math.round(parseFloat(String(s).replace(",", ".")) * 100) || 0;

export default function PortalPage() {
  return (
    <Suspense fallback={<main className="wrap"><p className="muted">Cargando...</p></main>}>
      <Portal />
    </Suspense>
  );
}

function Portal() {
  const searchParams = useSearchParams();
  const ridParam = searchParams.get("rid"); // admin entrando a un portal concreto
  const [data, setData] = useState(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [tab, setTab] = useState("pedidos");

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/data${ridParam ? `?rid=${ridParam}` : ""}`);
    if (res.status === 401 || res.status === 403) return setNeedLogin(true);
    if (!res.ok) {
      // Admin sin restaurante elegido → al panel de admin
      location.href = "/admin";
      return;
    }
    setData(await res.json());
    setNeedLogin(false);
  }, [ridParam]);

  useEffect(() => { load(); }, [load]);

  if (needLogin) return <LoginBox onDone={load} />;
  if (!data) return <main className="wrap"><p className="muted">Cargando...</p></main>;

  const r = data.restaurant;

  return (
    <main className="wrap-wide">
      <div className="topbar">
        <Link href="/" className="wordmark">pideperote<span className="dot">.</span></Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {data.role === "admin" && <Link href="/admin" className="tag">← Admin</Link>}
          <button
            className="btn ghost"
            onClick={async () => { await fetch("/api/portal/logout", { method: "POST" }); location.href = "/"; }}
          >
            Salir
          </button>
        </div>
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", margin: "4px 0 0" }}>{r.name}</h2>
      <OpenToggle restaurant={r} onChange={load} />

      <div className="tabs">
        {["pedidos", "carta", "ajustes"].map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "pedidos" ? "Pedidos" : t === "carta" ? "Carta" : "Ajustes"}
          </button>
        ))}
      </div>

      {tab === "pedidos" && <Orders rid={r.id} rname={r.name} />}
      {tab === "carta" && <MenuEditor data={data} reload={load} />}
      {tab === "ajustes" && (
        <>
          <CouriersSection rid={r.id} />
          <Settings data={data} reload={load} />
        </>
      )}
    </main>
  );
}

function LoginBox({ onDone }) {
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  async function login() {
    setErr("");
    const res = await fetch("/api/portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, password }),
    });
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    onDone();
  }
  return (
    <main className="wrap">
      <div className="login-box panel">
        <h3>Acceso restaurantes</h3>
        <div className="field">
          <label>Identificador (slug)</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mi-restaurante" />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn green" onClick={login}>Entrar</button>
        <p className="muted" style={{ marginTop: 12 }}>
          ¿Eres el administrador? <Link href="/admin"><u>Entra aquí</u></Link>
        </p>
      </div>
    </main>
  );
}

function OpenToggle({ restaurant, onChange }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch("/api/portal/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rid: restaurant.id, isOpen: !restaurant.is_open }),
    });
    await onChange();
    setBusy(false);
  }
  return (
    <button
      className={`btn small ${restaurant.is_open ? "green" : "danger"}`}
      style={{ marginTop: 8 }}
      disabled={busy}
      onClick={toggle}
    >
      {restaurant.is_open ? "🟢 Abierto — pulsar para cerrar" : "🔴 Cerrado — pulsar para abrir"}
    </button>
  );
}

/* ---------------- PEDIDOS ---------------- */

const STATUS_FLOW = [
  ["aceptado", "Aceptar"],
  ["listo", "Listo / En camino"],
  ["entregado", "Entregado"],
  ["rechazado", "Rechazar"],
];
const STATUS_LABEL = { nuevo: "🆕 Nuevo", aceptado: "👨‍🍳 En preparación", listo: "🛵 Listo/En camino", en_camino: "🛵 En camino", entregado: "✅ Entregado", rechazado: "❌ Rechazado" };

function Orders({ rid, rname }) {
  const [orders, setOrders] = useState(null);
  const [couriers, setCouriers] = useState([]);
  const [sound, setSound] = useState(true);
  const known = useRef(new Set());
  const first = useRef(true);
  const audioCtx = useRef(null);

  useEffect(() => {
    fetch(`/api/portal/couriers?rid=${rid}`)
      .then((r) => (r.ok ? r.json() : { couriers: [] }))
      .then((d) => setCouriers(d.couriers || []))
      .catch(() => {});
  }, [rid]);

  const beep = useCallback(() => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.4, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
      });
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/orders?rid=${rid}`);
    if (!res.ok) return;
    const d = await res.json();
    let fresh = false;
    for (const o of d.orders) {
      if (!known.current.has(o.id)) {
        known.current.add(o.id);
        if (!first.current) fresh = true;
      }
    }
    first.current = false;
    if (fresh && sound) beep();
    setOrders(d.orders);
  }, [rid, sound, beep]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    // Recargar al volver a la pestaña (el navegador congela pestañas en segundo plano)
    const onWake = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", onWake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [load]);

  async function setStatus(orderId, status) {
    await fetch("/api/portal/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    load();
  }

  if (!orders) return <p className="muted">Cargando pedidos...</p>;

  return (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input type="checkbox" style={{ width: 18, height: 18 }} checked={sound} onChange={(e) => setSound(e.target.checked)} />
        Sonido al llegar pedidos nuevos (mantén esta pestaña abierta)
      </label>
      {orders.length === 0 && <p className="muted">Sin pedidos en las últimas 48 horas.</p>}
      {orders.map((o) => (
        <div key={o.id} className={`panel order-card ${o.status === "nuevo" ? "nuevo" : ""} ${o.status === "entregado" || o.status === "rechazado" ? "done" : ""}`} style={{ borderLeftColor: o.status === "nuevo" ? "var(--cta)" : "var(--line)" }}>
          <div className="order-head">
            <span className="order-code">
              {o.code} <span className="tag">{STATUS_LABEL[o.status]}</span>
              {o.scheduled_for && (
                <span className="tag" style={{ marginLeft: 6, background: "var(--green)", color: "#fff" }}>
                  ⏰ {new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(o.scheduled_for))}
                </span>
              )}
            </span>
            <span className="order-time">{new Date(o.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="order-items">
            {o.items.map((it, i) => (
              <div key={i}>
                <b>{it.qty}x {it.name}</b> — {eur(it.unit_price_cents * it.qty)}
                {it.modifiers && <div className="mods">↳ {it.modifiers.split(" | ").join(", ")}</div>}
              </div>
            ))}
          </div>
          <div className="muted">
            {o.type === "reparto" ? `🛵 ${o.address}` : "🏃 Recogida"} · {o.customer_name} ·{" "}
            <a href={`tel:${o.phone}`}><u>{o.phone}</u></a>
            {o.notes && <div>📝 {o.notes}</div>}
          </div>
          <div className="totals big" style={{ marginTop: 6 }}>
            <span>Total (efectivo)</span><span>{eur(o.total_cents)}</span>
          </div>
          <CourierRow order={o} couriers={couriers} rname={rname} reload={load} />
          {o.status !== "entregado" && o.status !== "rechazado" && (
            <div className="status-select">
              {STATUS_FLOW.map(([st, label]) => (
                <button key={st} className={o.status === st ? "on" : ""} onClick={() => setStatus(o.id, st)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/* ---------------- REPARTIDORES ---------------- */

const waNumber = (phone) => {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length === 9 ? "34" + digits : digits; // España por defecto
};

function CourierRow({ order, couriers, rname, reload }) {
  const [busy, setBusy] = useState(false);
  if (!couriers.length || order.type !== "reparto") return null;
  if (order.status === "entregado" || order.status === "rechazado")
    return order.courier_name ? (
      <div className="courier-row">🛵 Repartidor: <b>{order.courier_name}</b></div>
    ) : null;

  async function send(c) {
    setBusy(true);
    // Abrimos la ventana ANTES del fetch para que el navegador no bloquee el popup
    const w = window.open("", "_blank");
    try {
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, courierId: c.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo asignar.");
      const msg =
        `🛵 Pedido ${order.code} — ${rname}\n` +
        `📍 ${order.address}\n` +
        `💶 Cobrar ${eur(order.total_cents)} en efectivo\n\n` +
        `Dirección, teléfono del cliente y botones de entrega:\n` +
        `${location.origin}/reparto/${d.token}`;
      const url = `https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(msg)}`;
      if (w) w.location = url;
      else location.href = url;
      reload();
    } catch (e) {
      if (w) w.close();
      alert(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="courier-row">
      <span className="muted">
        {order.courier_name
          ? <>🛵 Con <b>{order.courier_name}</b> · reenviar o cambiar:</>
          : "🛵 Enviar a repartidor:"}
      </span>
      {couriers.map((c) => (
        <button key={c.id} className="btn small secondary" disabled={busy} onClick={() => send(c)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

function CouriersSection({ rid }) {
  const [couriers, setCouriers] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/couriers?rid=${rid}`);
    if (res.ok) setCouriers((await res.json()).couriers);
  }, [rid]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr("");
    if (!name.trim()) return;
    const res = await fetch("/api/portal/couriers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rid, name, phone }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(d.error || "No se pudo añadir.");
    setName(""); setPhone("");
    load();
  }

  async function del(c) {
    if (!confirm(`¿Quitar a "${c.name}"?`)) return;
    await fetch(`/api/portal/couriers?id=${c.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="panel">
      <h3>Repartidores</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Añade a tus repartidores con su WhatsApp. En cada pedido de reparto te saldrá un botón con su
        nombre: al pulsarlo se abre WhatsApp con un enlace del pedido. Ahí el repartidor ve la dirección
        (con botón a Maps), el teléfono del cliente, qué lleva y cuánto cobrar, y marca <b>Recogido</b> y{" "}
        <b>Entregado</b> — tú y el cliente veis el estado al momento. Se guardan al añadir.
      </p>
      {couriers === null && <p className="muted">Cargando...</p>}
      {couriers?.length === 0 && <p className="muted">Todavía no hay repartidores.</p>}
      {couriers?.map((c) => (
        <div className="list-row" key={c.id}>
          <div className="grow"><b>{c.name}</b> <span className="muted">· {c.phone}</span></div>
          <button className="btn ghost" onClick={() => del(c)}>🗑</button>
        </div>
      ))}
      <div className="inline-form">
        <input value={name} placeholder="Nombre" onChange={(e) => setName(e.target.value)} />
        <input value={phone} placeholder="WhatsApp (600123456)" inputMode="tel" style={{ maxWidth: 190 }}
          onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn small green" onClick={add}>Añadir</button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

/* ---------------- CARTA ---------------- */

function MenuEditor({ data, reload }) {
  const rid = data.restaurant.id;
  const [newCat, setNewCat] = useState("");
  const [openItem, setOpenItem] = useState(null);

  async function rpc(action, payload) {
    const res = await fetch("/api/portal/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rid, action, ...payload }),
    });
    if (!res.ok) alert((await res.json()).error || "Error");
    await reload();
  }

  return (
    <>
      {data.categories.map((c) => (
        <div className="panel" key={c.id}>
          <div className="list-row" style={{ borderBottom: "none", paddingTop: 0 }}>
            <h3 style={{ margin: 0, flex: 1 }}>{c.name}</h3>
            <button className="btn small secondary" onClick={() => {
              const name = prompt("Nombre de la categoría:", c.name);
              if (name) rpc("category.update", { id: c.id, name, sort: c.sort });
            }}>Renombrar</button>
            <button className="btn small danger" onClick={() => {
              if (confirm(`¿Borrar "${c.name}" y todos sus artículos?`)) rpc("category.delete", { id: c.id });
            }}>Borrar</button>
          </div>
          {data.items.filter((i) => i.category_id === c.id).map((i) => (
            <ItemEditor key={i.id} item={i} data={data} rpc={rpc}
              open={openItem === i.id} setOpen={(v) => setOpenItem(v ? i.id : null)} />
          ))}
          <AddItem categoryId={c.id} rpc={rpc} />
        </div>
      ))}
      <div className="panel">
        <h3>Nueva categoría</h3>
        <div className="inline-form">
          <input value={newCat} placeholder="Ej: Hamburguesas" onChange={(e) => setNewCat(e.target.value)} />
          <button className="btn small green" onClick={() => { if (newCat.trim()) { rpc("category.add", { name: newCat }); setNewCat(""); } }}>
            Añadir
          </button>
        </div>
      </div>
    </>
  );
}

function AddItem({ categoryId, rpc }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <div className="inline-form">
      <input value={name} placeholder="Nuevo artículo" onChange={(e) => setName(e.target.value)} />
      <input value={price} placeholder="€" style={{ maxWidth: 90 }} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
      <button className="btn small green" onClick={() => {
        if (!name.trim()) return;
        rpc("item.add", { categoryId, name, priceCents: toCents(price) });
        setName(""); setPrice("");
      }}>Añadir</button>
    </div>
  );
}

function ItemEditor({ item, data, rpc, open, setOpen }) {
  const [form, setForm] = useState({ name: item.name, description: item.description, price: (item.price_cents / 100).toFixed(2) });
  const groups = data.groups.filter((g) => g.item_id === item.id);

  return (
    <div style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
      <div className="list-row" style={{ borderBottom: "none", padding: "4px 0" }}>
        <div className="grow">
          <b>{item.name}</b> · {eur(item.price_cents)}
          {!item.available && <span className="tag" style={{ marginLeft: 6 }}>Agotado</span>}
        </div>
        <button className="btn small secondary" onClick={() => rpc("item.toggle", { id: item.id })}>
          {item.available ? "Marcar agotado" : "Disponible"}
        </button>
        <button className="btn small secondary" onClick={() => setOpen(!open)}>{open ? "Cerrar" : "Editar"}</button>
      </div>
      {open && (
        <div style={{ padding: "8px 0 4px" }}>
          <div className="row2">
            <div className="field"><label>Nombre</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="field"><label>Precio (€)</label>
              <input value={form.price} inputMode="decimal" onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
          </div>
          <div className="field"><label>Descripción</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn small green" onClick={() =>
              rpc("item.update", { id: item.id, name: form.name, description: form.description, priceCents: toCents(form.price), available: item.available, sort: item.sort })
            }>Guardar</button>
            <button className="btn small danger" onClick={() => { if (confirm("¿Borrar artículo?")) rpc("item.delete", { id: item.id }); }}>Borrar</button>
          </div>

          <hr className="sep" />
          <b style={{ fontSize: 14 }}>Opciones del artículo (salsas, extras, tamaños...)</b>
          {groups.map((g) => (
            <GroupEditor key={g.id} group={g} options={data.options.filter((o) => o.group_id === g.id)} rpc={rpc} />
          ))}
          <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => {
            const name = prompt("Nombre del grupo (ej: Salsas, Extras, Tamaño):");
            if (!name) return;
            const max = Number(prompt("¿Cuántas opciones se pueden elegir como máximo?", "3")) || 1;
            const min = Number(prompt("¿Mínimo obligatorio? (0 = opcional)", "0")) || 0;
            rpc("group.add", { itemId: item.id, name, min, max });
          }}>+ Añadir grupo de opciones</button>
        </div>
      )}
    </div>
  );
}

function GroupEditor({ group, options, rpc }) {
  const [name, setName] = useState("");
  const [delta, setDelta] = useState("");
  return (
    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "8px 10px", marginTop: 8 }}>
      <div className="list-row" style={{ borderBottom: "none", padding: "2px 0" }}>
        <div className="grow">
          <b>{group.name}</b>{" "}
          <span className="muted">
            ({group.min_select > 0 ? `obligatorio, ` : "opcional, "}máx. {group.max_select})
          </span>
        </div>
        <button className="btn ghost" onClick={() => { if (confirm("¿Borrar grupo?")) rpc("group.delete", { id: group.id }); }}>🗑</button>
      </div>
      {options.map((o) => (
        <div className="list-row" key={o.id} style={{ padding: "4px 0" }}>
          <div className="grow">{o.name} {o.price_delta_cents !== 0 && <span className="muted">+{eur(o.price_delta_cents)}</span>}</div>
          <button className="btn ghost" onClick={() => rpc("option.delete", { id: o.id })}>✕</button>
        </div>
      ))}
      <div className="inline-form">
        <input value={name} placeholder="Ej: Con ketchup" onChange={(e) => setName(e.target.value)} />
        <input value={delta} placeholder="+€" style={{ maxWidth: 80 }} inputMode="decimal" onChange={(e) => setDelta(e.target.value)} />
        <button className="btn small secondary" onClick={() => {
          if (!name.trim()) return;
          rpc("option.add", { groupId: group.id, name, deltaCents: toCents(delta) });
          setName(""); setDelta("");
        }}>+</button>
      </div>
    </div>
  );
}

function QRSection({ slug, name }) {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(`${window.location.origin}/r/${slug}`); }, [slug]);
  if (!url) return null;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=2&data=${encodeURIComponent(url)}`;

  async function download() {
    try {
      const blob = await (await fetch(qrSrc)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `qr-${slug}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(qrSrc, "_blank");
    }
  }

  return (
    <div className="qr-box">
      <img src={qrSrc} alt={`Código QR de ${name}`} />
      <div>
        <p className="muted" style={{ margin: "0 0 10px", wordBreak: "break-all" }}>{url}</p>
        <button className="btn small green" onClick={download}>Descargar QR (PNG)</button>
      </div>
    </div>
  );
}

/* ---------------- AJUSTES ---------------- */

function Settings({ data, reload }) {
  const r = data.restaurant;
  const isAdmin = data.role === "admin";
  const emptySched = { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" };
  let initialSched = emptySched;
  try { initialSched = { ...emptySched, ...(r.schedule ? JSON.parse(r.schedule) : {}) }; } catch {}
  const [sched, setSched] = useState(initialSched);
  const [form, setForm] = useState({
    name: r.name,
    color: r.color,
    hours: r.hours,
    delivery: r.delivery,
    pickup: r.pickup,
    deliveryFee: (r.delivery_fee_cents / 100).toFixed(2),
    minOrder: (r.min_order_cents / 100).toFixed(2),
    maxPerHour: String(r.max_orders_per_hour || 0),
    whatsapp: r.whatsapp || "",
    portalPassword: r.portal_password || "",
  });
  const [logo, setLogo] = useState(undefined);
  const [cover, setCover] = useState(undefined);
  const [msg, setMsg] = useState("");

  function pickImage(e, maxPx, quality, setter) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const s = Math.min(maxPx / img.width, maxPx / img.height, 1);
        canvas.width = Math.round(img.width * s);
        canvas.height = Math.round(img.height * s);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        setter(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  const pickLogo = (e) => pickImage(e, 256, 0.85, setLogo);
  const pickCover = (e) => pickImage(e, 1000, 0.78, setCover);

  async function save() {
    setMsg("");
    const body = {
      rid: r.id,
      name: form.name,
      color: form.color,
      hours: form.hours,
      delivery: form.delivery,
      pickup: form.pickup,
      deliveryFeeCents: toCents(form.deliveryFee),
      minOrderCents: toCents(form.minOrder),
      maxOrdersPerHour: Number(form.maxPerHour) || 0,
    };
    if (logo !== undefined) body.logo = logo;
    if (cover !== undefined) body.cover = cover;
    body.schedule = Object.values(sched).some((v) => v.trim()) ? JSON.stringify(sched) : "";
    if (isAdmin) {
      body.whatsapp = form.whatsapp;
      body.portalPassword = form.portalPassword;
    }
    try {
      const res = await fetch("/api/portal/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Guardado ✓" : d.error || `No se pudo guardar (error ${res.status}).`);
      if (res.ok) reload();
    } catch {
      setMsg("No se pudo guardar: fallo de conexión.");
    }
  }

  return (
    <div className="panel">
      <div className="field"><label>Nombre del restaurante</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>

      <div className="row2">
        <div className="field">
          <label>Color del restaurante</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="color" value={form.color} style={{ width: 52, height: 42, padding: 2 }}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
            <span className="muted">{form.color}</span>
          </div>
        </div>
        <div className="field">
          <label>Logo</label>
          <input type="file" accept="image/*" onChange={pickLogo} />
          {(logo || r.logo) && <img src={logo ?? r.logo} alt="logo" style={{ width: 48, height: 48, borderRadius: 10, marginTop: 6, objectFit: "cover" }} />}
        </div>
      </div>

      <div className="field">
        <label>Foto de portada (se ve en la página principal, ideal apaisada)</label>
        <input type="file" accept="image/*" onChange={pickCover} />
        {(cover || r.cover) && (
          <img src={cover ?? r.cover} alt="portada" style={{ width: "100%", maxWidth: 340, borderRadius: 12, marginTop: 8, aspectRatio: "21/9", objectFit: "cover" }} />
        )}
      </div>

      <hr className="sep" />
      <h3 style={{ marginTop: 0 }}>Horario semanal</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Formato: <b>12:00-16:00, 19:00-23:30</b> · Vacío = cerrado ese día · Los tramos nocturnos
        tipo <b>20:00-01:30</b> también valen. Con horario puesto, el restaurante se abre y cierra
        solo (el botón de arriba sigue mandando: si lo pones en cerrado, cierra pase lo que pase).
      </p>
      {[["mon","Lunes"],["tue","Martes"],["wed","Miércoles"],["thu","Jueves"],["fri","Viernes"],["sat","Sábado"],["sun","Domingo"]].map(([d, label]) => (
        <div className="sched-row" key={d}>
          <label>{label}</label>
          <input
            value={sched[d]}
            placeholder="ej: 12:00-16:00, 19:00-23:30"
            onChange={(e) => setSched((s) => ({ ...s, [d]: e.target.value }))}
          />
        </div>
      ))}

      <hr className="sep" />
      <h3 style={{ marginTop: 0 }}>Tu código QR</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Imprímelo y ponlo en la barra, la puerta o los tickets: lleva directo a tu carta.
      </p>
      <QRSection slug={r.slug} name={r.name} />

      <hr className="sep" />
      <div className="field"><label>Horario en texto (solo se usa si no rellenas el horario semanal)</label>
        <input value={form.hours} placeholder="Ma-Do 12:00-16:00, 19:00-23:30" onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} /></div>

      <div className="row2">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
          <input type="checkbox" style={{ width: 18, height: 18 }} checked={form.delivery} onChange={(e) => setForm((f) => ({ ...f, delivery: e.target.checked }))} />
          Reparto a domicilio
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
          <input type="checkbox" style={{ width: 18, height: 18 }} checked={form.pickup} onChange={(e) => setForm((f) => ({ ...f, pickup: e.target.checked }))} />
          Recogida en local
        </label>
      </div>

      <div className="row2" style={{ marginTop: 10 }}>
        <div className="field"><label>Coste de reparto (€)</label>
          <input value={form.deliveryFee} inputMode="decimal" onChange={(e) => setForm((f) => ({ ...f, deliveryFee: e.target.value }))} /></div>
        <div className="field"><label>Pedido mínimo (€)</label>
          <input value={form.minOrder} inputMode="decimal" onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))} /></div>
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label>Máximo de pedidos por hora (0 = sin límite)</label>
        <input value={form.maxPerHour} inputMode="numeric" style={{ maxWidth: 140 }}
          onChange={(e) => setForm((f) => ({ ...f, maxPerHour: e.target.value }))} />
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Al llegar al límite, la web deja de aceptar pedidos durante un rato y avisa al cliente de que estáis a tope.
        </p>
      </div>

      {isAdmin && (
        <>
          <hr className="sep" />
          <p className="muted" style={{ marginTop: 0 }}>Solo visible para el admin:</p>
          <div className="row2">
            <div className="field"><label>WhatsApp del restaurante (para avisos de pedidos)</label>
              <input value={form.whatsapp} placeholder="600123456" onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} /></div>
            <div className="field"><label>Contraseña del portal</label>
              <input value={form.portalPassword} onChange={(e) => setForm((f) => ({ ...f, portalPassword: e.target.value }))} /></div>
          </div>
          <p className="muted">Slug de acceso: <b>{r.slug}</b> · Carta pública: /r/{r.slug}</p>
        </>
      )}

      {msg && <p className={msg.includes("✓") ? "ok" : "err"}>{msg}</p>}
      <button className="btn green" style={{ marginTop: 8 }} onClick={save}>Guardar cambios</button>
    </div>
  );
}
