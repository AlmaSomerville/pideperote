"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";

const STATUS_LABEL = {
  nuevo: "Enviado al restaurante",
  aceptado: "Aceptado, en preparación",
  listo: "Listo / en camino",
  en_camino: "En camino 🛵",
  entregado: "Entregado",
  rechazado: "Rechazado por el restaurante",
};

export default function OrderPage({ params }) {
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/order/${params.code}`, { cache: "no-store" });
        if (res.status === 404) return setNotFound(true);
        const d = await res.json();
        if (alive) {
          setData(d);
          // Guardar en "Tus pedidos" del navegador (sin cuentas)
          try {
            const list = JSON.parse(localStorage.getItem("pp_orders") || "[]")
              .filter((o) => o.code !== d.order.code);
            list.unshift({ code: d.order.code, restaurant: d.order.restaurant_name, at: d.order.created_at });
            localStorage.setItem("pp_orders", JSON.stringify(list.slice(0, 5)));
          } catch {}
        }
      } catch {}
    }
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    // El móvil congela pestañas en segundo plano: al volver (por cualquier vía), recargar al momento
    const onWake = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", onWake);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [params.code]);

  if (notFound)
    return (
      <main className="wrap confirm-box">
        <h1>Pedido no encontrado</h1>
        <Link href="/" className="btn secondary" style={{ maxWidth: 240, margin: "0 auto" }}>Volver al inicio</Link>
      </main>
    );

  if (!data) return <main className="wrap confirm-box"><p className="muted">Cargando...</p></main>;

  const { order, items } = data;
  const rejected = order.status === "rechazado";

  return (
    <main className="wrap">
      <div className="confirm-box">
        <div className="big-icon">{rejected ? "😕" : order.status === "entregado" ? "✅" : order.status === "en_camino" ? "🛵" : "🍔"}</div>
        <h1>{rejected ? "Pedido rechazado" : order.status === "entregado" ? "¡Pedido entregado!" : order.status === "en_camino" ? "Pedido en camino" : "¡Pedido enviado!"}</h1>
        <div className="code-chip">{order.code}</div>
        {order.scheduled_for && (
          <p className="status-now" style={{ marginBottom: 4 }}>
            ⏰ Programado para las{" "}
            {new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduled_for))}
          </p>
        )}
        <p className="status-line">Estado actual:</p>
        <p className="status-now">{STATUS_LABEL[order.status] || order.status}</p>
        {!rejected && order.status === "nuevo" && (
          <p className="muted">Si en unos minutos no cambia el estado, el restaurante puede llamarte para confirmar.</p>
        )}
        {rejected && (
          <p className="muted">Lo sentimos: el restaurante no puede atender el pedido ahora mismo. No se te cobrará nada.</p>
        )}
      </div>

      <div className="panel">
        <h3>{order.restaurant_name}</h3>
        {items.map((it, i) => (
          <div className="cart-line" key={i}>
            <div style={{ flex: 1 }}>
              <b>{it.qty}x {it.name}</b>
              {it.modifiers && <div className="mods">{it.modifiers.split(" | ").join(", ")}</div>}
            </div>
            <span>{eur(it.unit_price_cents * it.qty)}</span>
          </div>
        ))}
        <div className="totals big" style={{ marginTop: 10 }}>
          <span>Total (efectivo)</span><span>{eur(order.total_cents)}</span>
        </div>
        <p className="muted">
          {order.type === "reparto" ? "Pago en efectivo al repartidor." : "Pago en efectivo al recoger."}
        </p>
      </div>

      <Link href="/" className="btn secondary">Volver al inicio</Link>
    </main>
  );
}
