"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { ItemSheet } from "@/app/r/[slug]/MenuClient";

const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";
const hhmm = (d) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

const STATUS_LABEL = {
  nuevo: "🧑‍🍳 Enviado a cocina",
  aceptado: "🧑‍🍳 En preparación",
  listo: "✨ Listo",
  en_camino: "✨ En camino",
  entregado: "✅ Servido",
  rechazado: "❌ Rechazado — habla con el camarero",
};

export default function MesaClient({ restaurant, menu, token }) {
  const [cart, setCart] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [view, setView] = useState("menu"); // menu | cart | cuenta
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [bill, setBill] = useState(null); // { rounds, total, fetchedAt }
  const [paying, setPaying] = useState(false);
  const [payNote, setPayNote] = useState(""); // "ok" | "cancelado"
  const [, setTick] = useState(0); // re-render por segundo para la cuenta atrás

  useEffect(() => {
    try { setName(localStorage.getItem("pp_nombre") || ""); } catch {}
    const p = new URLSearchParams(window.location.search).get("pago");
    if (p) {
      setPayNote(p);
      setView("cuenta");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const loadBill = useCallback(async () => {
    try {
      const res = await fetch(`/api/mesa/${token}`, { cache: "no-store" });
      if (res.ok) setBill({ ...(await res.json()), fetchedAt: Date.now() });
    } catch {}
  }, [token]);

  useEffect(() => {
    loadBill();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadBill(); }, 8000);
    const onWake = () => { if (document.visibilityState === "visible") loadBill(); };
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
  }, [loadBill]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitCents * l.qty, 0), [cart]);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  function addToCart(item, selected, qty) {
    const mods = selected.map((o) => ({ name: o.name, delta: o.price_delta_cents }));
    const unitCents = item.price_cents + mods.reduce((s, m) => s + m.delta, 0);
    const key = item.id + "|" + mods.map((m) => m.name).sort().join(",");
    setCart((c) => {
      const ex = c.find((l) => l.key === key);
      if (ex) return c.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      return [...c, { key, itemId: item.id, name: item.name, unitCents, qty, mods }];
    });
    setSheet(null);
  }

  function changeQty(key, d) {
    setCart((c) =>
      c.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0)
    );
  }

  async function submitRound() {
    setErr("");
    if (!name.trim()) return setErr("Pon tu nombre para que el camarero sepa quién pide.");
    setSending(true);
    try {
      const res = await fetch(`/api/mesa/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, mods: l.mods.map((m) => m.name) })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo enviar el pedido.");
      try { localStorage.setItem("pp_nombre", name.trim()); } catch {}
      setCart([]);
      await loadBill();
      setView("cuenta");
    } catch (e) {
      setErr(e.message);
    }
    setSending(false);
  }

  async function pagarCuenta() {
    setPaying(true);
    try {
      const res = await fetch(`/api/mesa/${token}`, { method: "PUT" });
      const d = await res.json();
      if (res.ok && d.url) { location.href = d.url; return; }
      alert(d.error || "No se pudo iniciar el pago.");
    } catch { alert("Sin conexión. Prueba otra vez."); }
    setPaying(false);
  }

  async function cancelRound(id) {
    if (!confirm("¿Cancelar esta ronda antes de que vaya a cocina?")) return;
    const res = await fetch(`/api/mesa/${token}?orderId=${id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error || "No se pudo cancelar.");
    loadBill();
  }

  // Segundos que le quedan a una ronda en la ventana de cancelación (con hora del servidor)
  const secondsLeft = (r) =>
    !bill || r.status !== "nuevo"
      ? 0
      : Math.max(0, r.wait - Math.floor((Date.now() - bill.fetchedAt) / 1000));

  const billCount = bill?.rounds?.length || 0;

  return (
    <main className="wrap" style={{ "--rc": restaurant.color }}>
      <div className="topbar">
        <span className="wordmark">pideperote<span className="dot">.</span></span>
        <span className="tag">🍽️ EN LA MESA</span>
      </div>

      <div
        className={`menu-hero ${restaurant.cover ? "with-cover" : ""}`}
        style={restaurant.cover ? { backgroundImage: `url(${restaurant.cover})` } : undefined}
      >
        <h1>{restaurant.name}</h1>
        <p>{restaurant.is_open ? "Pide desde la mesa · se paga al camarero" : "El bar está cerrado ahora mismo"}</p>
      </div>

      <div className="pill-tabs" style={{ marginTop: 14 }}>
        <button className={view !== "cuenta" ? "on" : ""} onClick={() => setView(cart.length ? "cart" : "menu")}>
          Carta
        </button>
        <button className={view === "cuenta" ? "on" : ""} onClick={() => { setView("cuenta"); loadBill(); }}>
          Cuenta{billCount > 0 && bill ? ` · ${eur(bill.total)}` : ""}
        </button>
      </div>

      {view === "menu" && (
        <>
          {menu.map((cat) =>
            cat.items.length ? (
              <section key={cat.id}>
                <h2 className="cat-title">{cat.name}</h2>
                {cat.items.map((item) => (
                  <button
                    key={item.id}
                    className="item-row"
                    disabled={!item.available || !restaurant.is_open}
                    onClick={() => (item.groups.length ? setSheet(item) : addToCart(item, [], 1))}
                  >
                    <span>
                      <span className="item-name">{item.name}</span>
                      {!item.available && <span className="tag" style={{ marginLeft: 8 }}>Agotado</span>}
                      {item.description && <div className="item-desc">{item.description}</div>}
                    </span>
                    <span className="item-price">{eur(item.price_cents)}</span>
                  </button>
                ))}
              </section>
            ) : null
          )}
        </>
      )}

      {view === "cart" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Tu ronda</h3>
          {cart.length === 0 && <p className="muted">No hay nada todavía. Vuelve a la carta y añade algo.</p>}
          {cart.map((l) => (
            <div key={l.key} className="cart-line">
              <div style={{ flex: 1 }}>
                <div><b>{l.name}</b> · {eur(l.unitCents)}</div>
                {l.mods.length > 0 && <div className="mods">{l.mods.map((m) => m.name).join(", ")}</div>}
              </div>
              <div className="qty-ctrl">
                <button onClick={() => changeQty(l.key, -1)} aria-label="Quitar uno">−</button>
                <b>{l.qty}</b>
                <button onClick={() => changeQty(l.key, +1)} aria-label="Añadir uno">+</button>
              </div>
            </div>
          ))}
          <div className="totals big" style={{ marginTop: 12 }}>
            <span>Esta ronda</span><span>{eur(subtotal)}</span>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Tu nombre (lo verá el camarero y tu mesa)</label>
            <input value={name} placeholder="Ej: Pedro" onChange={(e) => setName(e.target.value)} />
          </div>
          <p className="muted" style={{ margin: "0 0 10px" }}>
            Tras pedir tienes 1 minuto para cancelar antes de que vaya a cocina.
          </p>
          {err && <p className="err">{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={() => setView("menu")}>Seguir mirando</button>
            <button className="btn" disabled={sending || !cart.length} onClick={submitRound}>
              {sending ? "Enviando..." : "Pedir a la mesa"}
            </button>
          </div>
        </div>
      )}

      {view === "cuenta" && (
        <div style={{ marginTop: 16 }}>
          {payNote === "ok" && (
            <div className="panel" style={{ borderLeft: "6px solid var(--green)" }}>
              <b>✅ Cuenta pagada — ¡gracias!</b>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                El bar ya lo ve como pagado. No tenéis que pagar nada al camarero.
              </p>
            </div>
          )}
          {payNote === "cancelado" && (
            <div className="panel" style={{ borderLeft: "6px solid var(--cta)" }}>
              <b>Pago cancelado</b>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                No pasa nada — podéis intentarlo otra vez o pagar al camarero.
              </p>
            </div>
          )}
          {!bill && <p className="muted">Cargando la cuenta...</p>}
          {bill && bill.rounds.length === 0 && (
            <div className="panel">
              <p className="muted" style={{ margin: 0 }}>
                La mesa no tiene nada pedido todavía. ¡Sé quien abra la cuenta!
              </p>
            </div>
          )}
          {bill?.rounds.map((r) => {
            const left = secondsLeft(r);
            return (
              <div className="panel" key={r.id}>
                <div className="order-head">
                  <span><b>{r.customer_name}</b></span>
                  <span className="order-time">{hhmm(r.created_at)}</span>
                </div>
                <div className="order-items">
                  {r.items.map((it, i) => (
                    <div key={i}>
                      {it.qty}x {it.name}
                      {it.modifiers && <span className="mods"> · {it.modifiers.split(" | ").join(", ")}</span>}
                    </div>
                  ))}
                </div>
                <div className="totals"><span></span><span><b>{eur(r.total_cents)}</b></span></div>
                {left > 0 ? (
                  <div className="grace-row">
                    <span>⏳ Va a cocina en 0:{String(left).padStart(2, "0")}</span>
                    <button className="btn small danger" onClick={() => cancelRound(r.id)}>Cancelar</button>
                  </div>
                ) : (
                  <span className="tag">{STATUS_LABEL[r.status] || r.status}</span>
                )}
              </div>
            );
          })}
          {bill && bill.rounds.length > 0 && (
            <div className="panel">
              <div className="totals big"><span>Total de la mesa</span><span>{eur(bill.total)}</span></div>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Cuenta compartida de toda la mesa{bill.online_ok ? "" : " · se paga al camarero"}.
              </p>
              {bill.online_ok && bill.total >= 50 && (() => {
                const inGrace = bill.rounds.some((r) => secondsLeft(r) > 0);
                return (
                  <>
                    <button className="btn big" style={{ marginTop: 12 }} disabled={paying || inGrace} onClick={pagarCuenta}>
                      💳 Pagar la cuenta ({eur(bill.total)})
                    </button>
                    <p className="muted" style={{ textAlign: "center", margin: "6px 0 0" }}>
                      {inGrace
                        ? "Podréis pagar cuando la última ronda vaya a cocina (menos de un minuto)."
                        : "Tarjeta o Bizum · también podéis pagar al camarero como siempre."}
                    </p>
                  </>
                );
              })()}
            </div>
          )}
          <button className="btn secondary" style={{ marginTop: 4 }} onClick={() => setView("menu")}>
            Pedir más
          </button>
        </div>
      )}

      {sheet && <ItemSheet item={sheet} onClose={() => setSheet(null)} onAdd={addToCart} />}

      {view === "menu" && (count > 0 || billCount > 0) && (
        <div className="cartbar">
          {count > 0 ? (
            <button className="btn" onClick={() => setView("cart")}>
              Ver ronda · {count} {count === 1 ? "artículo" : "artículos"} · {eur(subtotal)}
            </button>
          ) : (
            <button className="btn green" onClick={() => { setView("cuenta"); loadBill(); }}>
              Ver la cuenta de la mesa · {eur(bill.total)}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
