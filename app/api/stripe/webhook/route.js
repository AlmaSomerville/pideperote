import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { sendWhatsApp, orderMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Webhook de Stripe (configurado para escuchar eventos de las CUENTAS CONECTADAS).
// Verifica la firma con STRIPE_WEBHOOK_SECRET y marca pedidos/cuentas como pagados.
// Idempotente: si Stripe reintenta el evento, el WHERE paid... = FALSE evita duplicar nada.
export async function POST(req) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("webhook firma inválida:", e.message);
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status && session.payment_status !== "paid")
      return NextResponse.json({ received: true }); // p.ej. pagos diferidos: esperar a estar pagado

    const m = session.metadata || {};

    if (m.kind === "order" && m.code) {
      const [o] = await sql`UPDATE orders SET paid_online = TRUE, paid_at = NOW(), stripe_session_id = ${session.id}
        WHERE code = ${m.code} AND paid_online = FALSE RETURNING *`;
      if (o) {
        // Ahora que está pagado, el pedido se hace visible al bar: avisar por WhatsApp
        const [rest] = await sql`SELECT whatsapp FROM restaurants WHERE id = ${o.restaurant_id}`;
        if (rest?.whatsapp) {
          const items = await sql`SELECT name, qty, unit_price_cents, modifiers FROM order_items WHERE order_id = ${o.id}`;
          await sendWhatsApp(
            rest.whatsapp,
            "💶 PAGADO ONLINE — no cobrar al cliente\n" +
              orderMessage(o, items, o.delivery_fee_cents, "PAGADO ✅")
          );
        }
      }
    }

    if (m.kind === "mesa" && m.order_ids) {
      const ids = String(m.order_ids).split(",").map(Number).filter(Boolean);
      if (ids.length) {
        await sql`UPDATE orders SET paid_online = TRUE, paid_at = NOW(), stripe_session_id = ${session.id}
          WHERE id = ANY(${ids}) AND paid_at IS NULL`;
      }
    }
  }

  return NextResponse.json({ received: true });
}
