"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";

export default function MenuClient({ restaurant, menu }) {
  const router = useRouter();
  const [cart, setCart] = useState([]); // {key, itemId, name, unitCents, qty, mods:[{name,delta}]}
  const [sheet, setSheet] = useState(null); // item being configured
  const [view, setView] = useState("menu"); // menu | cart | checkout
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [when, setWhen] = useState(restaurant.is_open ? "asap" : "slot");
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState("");
  const [form, setForm] = useState({
    type: restaurant.delivery ? "reparto" : "recogida",
    name: "",
    phone: "",
    address: "",
    notes: "",
  });

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitCents * l.qty, 0), [cart]);
  const fee = form.type === "reparto" ? restaurant.delivery_fee_cents : 0;
  const total = subtotal + fee;
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const belowMin = restaurant.min_order_cents > 0 && subtotal < restaurant.min_order_cents;

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

  async function loadSlots(autopick) {
    try {
      const res = await fetch(`/api/slots?rid=${restaurant.id}`, { cache: "no-store" });
      const d = await res.json();
      setSlots(d.slots || []);
      if ((autopick || !restaurant.is_open) && d.slots?.length && !slot) setSlot(String(d.slots[0].t));
      return d;
    } catch {
      setSlots([]);
      return { slots: [] };
    }
  }

  async function submitOrder() {
    setErr("");
    if (!form.name.trim() || form.phone.replace(/\D/g, "").length < 9)
      return setErr("Pon tu nombre y un teléfono válido.");
    if (form.type === "reparto" && !form.address.trim())
      return setErr("Falta la dirección de entrega.");
    if (when === "slot" && !slot) return setErr("Elige una hora para tu pedido.");
    setSending(true);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          scheduledFor: when === "slot" ? Number(slot) : undefined,
          ...form,
          lines: cart.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            mods: l.mods.map((m) => m.name),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.busy) {
          const d = await loadSlots(true);
          setWhen("slot");
          setSending(false);
          setErr(d.slots?.length
            ? `Están a tope ahora mismo — el primer hueco disponible es a las ${d.slots[0].label}. Elige hora y vuelve a enviar.`
            : "Están a tope ahora mismo. Prueba en unos minutos.");
          return;
        }
        throw new Error(data.error || "No se pudo enviar el pedido.");
      }
      router.push(`/pedido/${data.code}`);
    } catch (e) {
      setErr(e.message);
      setSending(false);
    }
  }

  return (
    <main className="wrap" style={{ "--rc": restaurant.color }}>
      <div className="topbar">
        <Link href="/" className="wordmark">
          pideperote<span className="dot">.</span>
        </Link>
      </div>

      <div
        className={`menu-hero ${restaurant.cover ? "with-cover" : ""}`}
        style={restaurant.cover ? { backgroundImage: `url(${restaurant.cover})` } : undefined}
      >
        <h1>{restaurant.name}</h1>
        <p>
          {restaurant.is_open ? "Abierto ahora" : restaurant.preorder ? `Cerrado ahora · puedes pedir para luego (${restaurant.opensAt.toLowerCase()})` : "Cerrado ahora"}
          {restaurant.hours ? ` · ${restaurant.hours}` : ""}
          {restaurant.delivery_fee_cents > 0 && ` · Reparto ${eur(restaurant.delivery_fee_cents)}`}
          {restaurant.min_order_cents > 0 && ` · Mínimo ${eur(restaurant.min_order_cents)}`}
        </p>
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
                    disabled={!item.available || (!restaurant.is_open && !restaurant.preorder)}
                    onClick={() =>
                      item.groups.length
                        ? setSheet(item)
                        : addToCart(item, [], 1)
                    }
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
          {!restaurant.is_open && !restaurant.preorder && (
            <p className="muted" style={{ textAlign: "center", marginTop: 20 }}>
              Este restaurante está cerrado ahora mismo. Vuelve en su horario de apertura.
            </p>
          )}
        </>
      )}

      {view === "cart" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Tu pedido</h3>
          {cart.map((l) => (
            <div key={l.key} className="cart-line">
              <div style={{ flex: 1 }}>
                <div>
                  <b>{l.name}</b> · {eur(l.unitCents)}
                </div>
                {l.mods.length > 0 && (
                  <div className="mods">{l.mods.map((m) => m.name).join(", ")}</div>
                )}
              </div>
              <div className="qty-ctrl">
                <button onClick={() => changeQty(l.key, -1)} aria-label="Quitar uno">−</button>
                <b>{l.qty}</b>
                <button onClick={() => changeQty(l.key, +1)} aria-label="Añadir uno">+</button>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <div className="totals"><span>Subtotal</span><span>{eur(subtotal)}</span></div>
            {fee > 0 && <div className="totals"><span>Reparto</span><span>{eur(fee)}</span></div>}
            <div className="totals big"><span>Total (efectivo)</span><span>{eur(total)}</span></div>
          </div>
          {belowMin && (
            <p className="err">El pedido mínimo es {eur(restaurant.min_order_cents)}.</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn secondary" onClick={() => setView("menu")}>Seguir pidiendo</button>
            <button className="btn" disabled={belowMin || !cart.length}
              onClick={() => { setView("checkout"); if (!slots) loadSlots(false); }}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {view === "checkout" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>¿Para cuándo?</h3>
          {restaurant.is_open ? (
            <div className="pill-tabs">
              <button className={when === "asap" ? "on" : ""} onClick={() => setWhen("asap")}>⚡ Lo antes posible</button>
              <button className={when === "slot" ? "on" : ""} onClick={() => { setWhen("slot"); if (!slots) loadSlots(true); }}>⏰ Programar</button>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              El restaurante está cerrado ahora — tu pedido quedará programado para cuando abra.
            </p>
          )}
          {when === "slot" && (
            <div className="field">
              <label>Hora del pedido</label>
              {slots === null ? (
                <p className="muted">Cargando horas...</p>
              ) : slots.length === 0 ? (
                <p className="err">No hay horas disponibles ahora mismo.</p>
              ) : (
                <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                  {slots.map((s) => (
                    <option key={s.t} value={String(s.t)}>{s.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <h3>Tus datos</h3>
          <div className="pill-tabs">
            {restaurant.delivery && (
              <button
                className={form.type === "reparto" ? "on" : ""}
                onClick={() => setForm((f) => ({ ...f, type: "reparto" }))}
              >
                🛵 Reparto
              </button>
            )}
            {restaurant.pickup && (
              <button
                className={form.type === "recogida" ? "on" : ""}
                onClick={() => setForm((f) => ({ ...f, type: "recogida" }))}
              >
                🏃 Recoger
              </button>
            )}
          </div>
          <div className="field">
            <label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Teléfono (móvil)</label>
            <input
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          {form.type === "reparto" && (
            <div className="field">
              <label>Dirección en Álora</label>
              <input
                value={form.address}
                placeholder="Calle, número, piso..."
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
          )}
          <div className="field">
            <label>Notas (opcional)</label>
            <textarea
              rows={2}
              value={form.notes}
              placeholder="Sin cebolla, timbre roto, etc."
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="totals big"><span>Total (efectivo)</span><span>{eur(total)}</span></div>
          {err && <p className="err">{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setView("cart")}>Atrás</button>
            <button className="btn" disabled={sending} onClick={submitOrder}>
              {sending ? "Enviando..." : "Hacer pedido"}
            </button>
          </div>
        </div>
      )}

      {sheet && <ItemSheet item={sheet} onClose={() => setSheet(null)} onAdd={addToCart} />}

      {count > 0 && view === "menu" && (
        <div className="cartbar">
          <button className="btn" onClick={() => setView("cart")}>
            Ver pedido · {count} {count === 1 ? "artículo" : "artículos"} · {eur(subtotal)}
          </button>
        </div>
      )}
    </main>
  );
}

function ItemSheet({ item, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState({}); // groupId -> array of options

  function toggle(group, opt) {
    setSel((s) => {
      const cur = s[group.id] || [];
      const has = cur.some((o) => o.id === opt.id);
      let next;
      if (group.max_select === 1) next = has ? [] : [opt];
      else if (has) next = cur.filter((o) => o.id !== opt.id);
      else if (cur.length >= group.max_select) next = cur;
      else next = [...cur, opt];
      return { ...s, [group.id]: next };
    });
  }

  const selected = Object.values(sel).flat();
  const missing = item.groups.filter((g) => (sel[g.id]?.length || 0) < g.min_select);
  const unit = item.price_cents + selected.reduce((s, o) => s + o.price_delta_cents, 0);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{item.name}</h2>
        {item.description && <p className="muted" style={{ margin: 0 }}>{item.description}</p>}

        {item.groups.map((g) => (
          <div className="mod-group" key={g.id}>
            <div className="mod-group-name">{g.name}</div>
            <div className="mod-group-hint">
              {g.min_select > 0 ? `Elige ${g.min_select === g.max_select ? g.min_select : `entre ${g.min_select} y ${g.max_select}`}` : `Opcional · máx. ${g.max_select}`}
            </div>
            {g.options.map((o) => (
              <label className="mod-opt" key={o.id}>
                <input
                  type={g.max_select === 1 ? "radio" : "checkbox"}
                  checked={(sel[g.id] || []).some((x) => x.id === o.id)}
                  onChange={() => toggle(g, o)}
                />
                {o.name}
                {o.price_delta_cents !== 0 && (
                  <span className="delta">+{eur(o.price_delta_cents)}</span>
                )}
              </label>
            ))}
          </div>
        ))}

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 20 }}>
          <div className="qty-ctrl">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <b>{qty}</b>
            <button onClick={() => setQty((q) => q + 1)}>+</button>
          </div>
          <button
            className="btn"
            disabled={missing.length > 0}
            onClick={() => onAdd(item, selected, qty)}
          >
            Añadir · {eur(unit * qty)}
          </button>
        </div>
        {missing.length > 0 && (
          <p className="muted" style={{ marginTop: 8 }}>Falta elegir: {missing.map((g) => g.name).join(", ")}</p>
        )}
      </div>
    </div>
  );
}
