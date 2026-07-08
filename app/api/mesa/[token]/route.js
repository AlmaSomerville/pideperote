import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { effectiveOpen } from "@/lib/hours";
import { priceLines, insertOrder } from "@/lib/order-utils";
import { onlineOk, createCheckout } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// El token de la mesa (dentro del QR impreso) ES la autorización — no hay cuentas.
// Cada ronda espera GRACE segundos antes de ser visible en el bar: en ese rato
// cualquiera de la mesa puede cancelarla. Es el "deshacer" y también el antispam.
const GRACE = 60;
// La cuenta agrupa las rondas sin pagar de las últimas 6 horas (ver GET)

async function findTable(token) {
  const [t] = await sql`SELECT t.id, t.label, t.restaurant_id, r.name AS restaurant_name,
      r.is_open, r.schedule, r.active,
      r.stripe_account_id, r.stripe_charges_enabled, r.online_payments,
      r.commission_bps, r.commission_fixed_cents
    FROM tables t JOIN restaurants r ON r.id = t.restaurant_id
    WHERE t.token = ${token}`;
  return t && t.active ? t : null;
}

// GET /api/mesa/[token] — la cuenta de la mesa (rondas sin pagar)
export async function GET(_req, { params }) {
  const t = await findTable(params.token);
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rounds = await sql`SELECT id, customer_name, status, created_at, total_cents FROM orders
    WHERE table_id = ${t.id} AND type = 'mesa' AND paid_at IS NULL
    AND created_at > NOW() - INTERVAL '6 hours'
    ORDER BY created_at`;
  const ids = rounds.map((r) => r.id);
  const items = ids.length
    ? await sql`SELECT order_id, name, qty, modifiers FROM order_items WHERE order_id = ANY(${ids})`
    : [];

  const now = Date.now();
  const out = rounds.map((r) => ({
    ...r,
    items: items.filter((i) => i.order_id === r.id),
    // Segundos que le quedan en la ventana de cancelación (0 = ya fue a cocina)
    wait: r.status === "nuevo"
      ? Math.max(0, GRACE - Math.floor((now - new Date(r.created_at).getTime()) / 1000))
      : 0,
  }));
  const total = out.filter((r) => r.status !== "rechazado").reduce((s, r) => s + r.total_cents, 0);

  return NextResponse.json(
    { open: effectiveOpen(t), rounds: out, total, grace: GRACE, online_ok: onlineOk(t) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST { name, lines } — nueva ronda para la mesa
export async function POST(req, { params }) {
  try {
    const b = await req.json().catch(() => ({}));
    const name = String(b.name || "").trim().slice(0, 60);
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (!name || !lines.length)
      return NextResponse.json({ error: "Pon tu nombre y añade algo al pedido." }, { status: 400 });

    const t = await findTable(params.token);
    if (!t) return NextResponse.json({ error: "Mesa no encontrada." }, { status: 404 });
    if (!effectiveOpen(t))
      return NextResponse.json({ error: "El bar está cerrado ahora mismo." }, { status: 400 });

    // Freno suave: muchas rondas muy seguidas desde la misma mesa
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM orders
      WHERE table_id = ${t.id} AND type = 'mesa' AND created_at > NOW() - INTERVAL '5 minutes'`;
    if (n >= 4)
      return NextResponse.json(
        { error: "Habéis pedido varias rondas muy seguidas. Espera un momento o avisa al camarero." },
        { status: 429 }
      );

    const priced = await priceLines(t.restaurant_id, lines);
    if (priced.error) return NextResponse.json({ error: priced.error }, { status: 400 });

    const order = await insertOrder(
      {
        restaurantId: t.restaurant_id,
        customerName: name,
        type: "mesa",
        totalCents: priced.subtotal,
        tableId: t.id,
        tableLabel: t.label,
      },
      priced.orderLines
    );
    return NextResponse.json({ ok: true, id: order.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo enviar el pedido." }, { status: 500 });
  }
}


// PUT /api/mesa/[token] — pagar la cuenta de la mesa online (tarjeta/Bizum).
// Cubre todas las rondas sin pagar que YA fueron a cocina. Si alguna sigue en su
// ventana de cancelación, se pide esperar (evita pagar algo que luego se cancela).
export async function PUT(req, { params }) {
  const t = await findTable(params.token);
  if (!t) return NextResponse.json({ error: "Mesa no encontrada." }, { status: 404 });
  if (!onlineOk(t))
    return NextResponse.json({ error: "Este bar no acepta pago online. Pide la cuenta al camarero." }, { status: 400 });

  const rounds = await sql`SELECT id, status, created_at FROM orders
    WHERE table_id = ${t.id} AND type = 'mesa' AND paid_at IS NULL AND status != 'rechazado'
    AND created_at > NOW() - INTERVAL '6 hours' ORDER BY created_at`;
  if (!rounds.length)
    return NextResponse.json({ error: "No hay nada pendiente de pagar." }, { status: 400 });
  const inGrace = rounds.some(
    (r) => r.status === "nuevo" && Date.now() - new Date(r.created_at).getTime() < GRACE * 1000
  );
  if (inGrace)
    return NextResponse.json(
      { error: "Hay una ronda que aún se puede cancelar. Podréis pagar en menos de un minuto." },
      { status: 409 }
    );

  const [{ total }] = await sql`SELECT COALESCE(SUM(total_cents),0)::int AS total FROM orders
    WHERE id = ANY(${rounds.map((r) => r.id)})`;
  if (total < 50)
    return NextResponse.json({ error: "El importe es demasiado pequeño para pago online." }, { status: 400 });

  const origin = new URL(req.url).origin;
  try {
    const session = await createCheckout({
      rest: t,
      amountCents: total,
      productName: `Cuenta de la mesa — ${t.restaurant_name}`,
      metadata: { kind: "mesa", table_id: String(t.id), order_ids: rounds.map((r) => r.id).join(",") },
      successUrl: `${origin}/mesa/${params.token}?pago=ok`,
      cancelUrl: `${origin}/mesa/${params.token}?pago=cancelado`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("mesa pay error:", e.message);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Pide la cuenta al camarero." }, { status: 500 });
  }
}

// DELETE /api/mesa/[token]?orderId=X — cancelar una ronda dentro de la ventana de gracia
export async function DELETE(req, { params }) {
  const orderId = Number(new URL(req.url).searchParams.get("orderId"));
  const [o] = await sql`SELECT o.id FROM orders o
    JOIN tables t ON t.id = o.table_id
    WHERE o.id = ${orderId} AND t.token = ${params.token} AND o.type = 'mesa'
    AND o.status = 'nuevo' AND o.paid_at IS NULL AND o.created_at > NOW() - INTERVAL '60 seconds'`;
  if (!o)
    return NextResponse.json(
      { error: "Esta ronda ya ha ido a cocina. Avisa al camarero si quieres cambiarla." },
      { status: 409 }
    );
  await sql`DELETE FROM orders WHERE id = ${o.id}`; // las líneas se borran en cascada
  return NextResponse.json({ ok: true });
}
