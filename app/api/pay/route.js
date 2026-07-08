import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { onlineOk, createCheckout } from "@/lib/stripe";
import { sendWhatsApp, orderMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// POST { code } — crea (o re-crea) la sesión de pago de un pedido y devuelve su URL.
// El importe sale SIEMPRE de la base de datos, nunca del cliente.
export async function POST(req) {
  const { code } = await req.json().catch(() => ({}));
  const [o] = await sql`SELECT * FROM orders WHERE code = ${String(code || "").toUpperCase()}`;
  if (!o) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  if (o.paid_online || o.paid_at)
    return NextResponse.json({ error: "Este pedido ya está pagado." }, { status: 400 });
  if (o.status === "rechazado")
    return NextResponse.json({ error: "Este pedido fue rechazado." }, { status: 400 });

  const [rest] = await sql`SELECT * FROM restaurants WHERE id = ${o.restaurant_id}`;
  if (!onlineOk(rest))
    return NextResponse.json({ error: "Este restaurante no acepta pagos online ahora mismo. Puedes pagar en efectivo." }, { status: 400 });
  if (o.total_cents < 50)
    return NextResponse.json({ error: "El importe es demasiado pequeño para pago online." }, { status: 400 });

  const origin = new URL(req.url).origin;
  try {
    const session = await createCheckout({
      rest,
      amountCents: o.total_cents,
      productName: `Pedido ${o.code} — ${rest.name}`,
      metadata: { kind: "order", code: o.code, restaurant_id: String(rest.id) },
      successUrl: `${origin}/pedido/${o.code}?pago=ok`,
      cancelUrl: `${origin}/pedido/${o.code}?pago=cancelado`,
    });
    await sql`UPDATE orders SET stripe_session_id = ${session.id}, pay_method = 'online' WHERE id = ${o.id}`;
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("pay error:", e.message);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Puedes pagar en efectivo." }, { status: 500 });
  }
}

// PATCH { code } — el cliente prefiere pagar en efectivo: el pedido pasa a ser
// visible para el bar y se le avisa por WhatsApp (al crearse no se avisó por estar sin pagar).
export async function PATCH(req) {
  const { code } = await req.json().catch(() => ({}));
  const [o] = await sql`UPDATE orders SET pay_method = 'efectivo'
    WHERE code = ${String(code || "").toUpperCase()} AND pay_method = 'online' AND paid_online = FALSE
    RETURNING *`;
  if (!o) return NextResponse.json({ error: "No se pudo cambiar (¿ya está pagado?)." }, { status: 400 });

  const [rest] = await sql`SELECT whatsapp FROM restaurants WHERE id = ${o.restaurant_id}`;
  if (rest?.whatsapp) {
    const items = await sql`SELECT name, qty, unit_price_cents, modifiers FROM order_items WHERE order_id = ${o.id}`;
    await sendWhatsApp(rest.whatsapp, orderMessage(o, items, o.delivery_fee_cents));
  }
  return NextResponse.json({ ok: true });
}
