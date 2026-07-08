import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendWhatsApp, orderMessage } from "@/lib/whatsapp";
import { effectiveOpen, nextOpeningText } from "@/lib/hours";
import { availability, candidateSlots, slotCapacity, SLOT_MS } from "@/lib/slots";
import { priceLines, insertOrder } from "@/lib/order-utils";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const { restaurantId, name, phone, address = "", notes = "", type, lines, scheduledFor } = body;
    if (!restaurantId || !name?.trim() || !phone?.trim() || !Array.isArray(lines) || !lines.length)
      return NextResponse.json({ error: "Faltan datos del pedido." }, { status: 400 });

    const [rest] = await sql`SELECT * FROM restaurants WHERE id = ${restaurantId} AND active = TRUE`;
    if (!rest) return NextResponse.json({ error: "Restaurante no encontrado." }, { status: 404 });
    // ¿Pedido programado o "lo antes posible"?
    let slotTs = null;
    if (scheduledFor) {
      slotTs = Number(scheduledFor);
      const valid = Number.isFinite(slotTs) && slotTs % SLOT_MS === 0 && candidateSlots(rest).includes(slotTs);
      if (!valid)
        return NextResponse.json({ error: "Esa hora ya no está disponible. Elige otra." }, { status: 400 });
      const cap = slotCapacity(rest);
      const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM orders
        WHERE restaurant_id = ${rest.id} AND status != 'rechazado'
        AND scheduled_for = ${new Date(slotTs).toISOString()}`;
      if (n >= cap)
        return NextResponse.json({ error: "Esa hora se acaba de llenar. Elige otra." }, { status: 409 });
    } else {
      if (!effectiveOpen(rest)) {
        const next = nextOpeningText(rest);
        return NextResponse.json(
          { error: `El restaurante está cerrado ahora.${next ? " " + next + "." : ""}`, closed: true },
          { status: 400 }
        );
      }
      if (rest.max_orders_per_hour > 0) {
        const { asapOk } = await availability(rest);
        if (!asapOk)
          return NextResponse.json(
            { error: "El restaurante está a tope ahora mismo.", busy: true },
            { status: 429 }
          );
      }
    }

    const orderType = type === "recogida" && rest.pickup ? "recogida" : "reparto";
    if (orderType === "reparto" && !rest.delivery)
      return NextResponse.json({ error: "Este restaurante no hace reparto." }, { status: 400 });
    if (orderType === "reparto" && !address.trim())
      return NextResponse.json({ error: "Falta la dirección." }, { status: 400 });

    // Recalcular precios en servidor (nunca confiar en el cliente)
    const priced = await priceLines(rest.id, lines);
    if (priced.error) return NextResponse.json({ error: priced.error }, { status: 400 });
    const { subtotal, orderLines } = priced;

    if (rest.min_order_cents > 0 && subtotal < rest.min_order_cents)
      return NextResponse.json(
        { error: `El pedido mínimo es ${(rest.min_order_cents / 100).toFixed(2)}€.` },
        { status: 400 }
      );

    const feeCents = orderType === "reparto" ? rest.delivery_fee_cents : 0;
    const total = subtotal + feeCents;

    const order = await insertOrder(
      {
        restaurantId: rest.id,
        customerName: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim().slice(0, 500),
        type: orderType,
        totalCents: total,
        deliveryFeeCents: feeCents,
        scheduledFor: slotTs ? new Date(slotTs).toISOString() : null,
      },
      orderLines
    );

    if (rest.whatsapp) {
      // No bloquear el pedido si WhatsApp falla
      sendWhatsApp(rest.whatsapp, orderMessage(order, orderLines, feeCents)).catch(() => {});
    }

    return NextResponse.json({ code: order.code });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Error al procesar el pedido." }, { status: 500 });
  }
}
