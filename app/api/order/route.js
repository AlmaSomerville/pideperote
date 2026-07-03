import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendWhatsApp, orderMessage } from "@/lib/whatsapp";
import { effectiveOpen, nextOpeningText } from "@/lib/hours";

export const dynamic = "force-dynamic";

function makeCode() {
  return "PP-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { restaurantId, name, phone, address = "", notes = "", type, lines } = body;
    if (!restaurantId || !name?.trim() || !phone?.trim() || !Array.isArray(lines) || !lines.length)
      return NextResponse.json({ error: "Faltan datos del pedido." }, { status: 400 });

    const [rest] = await sql`SELECT * FROM restaurants WHERE id = ${restaurantId} AND active = TRUE`;
    if (!rest) return NextResponse.json({ error: "Restaurante no encontrado." }, { status: 404 });
    if (!effectiveOpen(rest)) {
      const next = nextOpeningText(rest);
      return NextResponse.json({ error: `El restaurante está cerrado.${next ? " " + next + "." : ""}` }, { status: 400 });
    }

    if (rest.max_orders_per_hour > 0) {
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM orders
        WHERE restaurant_id = ${rest.id} AND status != 'rechazado'
        AND created_at > NOW() - INTERVAL '60 minutes'`;
      if (count >= rest.max_orders_per_hour)
        return NextResponse.json(
          { error: "El restaurante está a tope ahora mismo y no acepta más pedidos por un rato. Prueba en unos minutos." },
          { status: 429 }
        );
    }

    const orderType = type === "recogida" && rest.pickup ? "recogida" : "reparto";
    if (orderType === "reparto" && !rest.delivery)
      return NextResponse.json({ error: "Este restaurante no hace reparto." }, { status: 400 });
    if (orderType === "reparto" && !address.trim())
      return NextResponse.json({ error: "Falta la dirección." }, { status: 400 });

    // Recalcular precios en servidor (nunca confiar en el cliente)
    const itemIds = [...new Set(lines.map((l) => Number(l.itemId)))];
    const items = await sql`SELECT id, name, price_cents, available FROM items
      WHERE id = ANY(${itemIds}) AND restaurant_id = ${rest.id}`;
    const groups = await sql`SELECT g.id, g.item_id FROM modifier_groups g WHERE g.item_id = ANY(${itemIds})`;
    const options = groups.length
      ? await sql`SELECT id, group_id, name, price_delta_cents FROM modifier_options
          WHERE group_id = ANY(${groups.map((g) => g.id)})`
      : [];

    let subtotal = 0;
    const orderLines = [];
    for (const l of lines) {
      const item = items.find((i) => i.id === Number(l.itemId));
      if (!item || !item.available)
        return NextResponse.json({ error: `"${item?.name || "Un artículo"}" ya no está disponible.` }, { status: 400 });
      const qty = Math.max(1, Math.min(50, Number(l.qty) || 1));
      const itemGroupIds = groups.filter((g) => g.item_id === item.id).map((g) => g.id);
      const validOpts = options.filter((o) => itemGroupIds.includes(o.group_id));
      const chosen = (l.mods || [])
        .map((mName) => validOpts.find((o) => o.name === mName))
        .filter(Boolean);
      const unit = item.price_cents + chosen.reduce((s, o) => s + o.price_delta_cents, 0);
      subtotal += unit * qty;
      orderLines.push({
        name: item.name,
        qty,
        unit_price_cents: unit,
        modifiers: chosen.map((o) => o.name).join(" | "),
      });
    }

    if (rest.min_order_cents > 0 && subtotal < rest.min_order_cents)
      return NextResponse.json(
        { error: `El pedido mínimo es ${(rest.min_order_cents / 100).toFixed(2)}€.` },
        { status: 400 }
      );

    const feeCents = orderType === "reparto" ? rest.delivery_fee_cents : 0;
    const total = subtotal + feeCents;

    let order = null;
    for (let i = 0; i < 5 && !order; i++) {
      try {
        [order] = await sql`INSERT INTO orders
          (code, restaurant_id, customer_name, phone, address, notes, type, total_cents, delivery_fee_cents)
          VALUES (${makeCode()}, ${rest.id}, ${name.trim()}, ${phone.trim()}, ${address.trim()},
                  ${notes.trim().slice(0, 500)}, ${orderType}, ${total}, ${feeCents})
          RETURNING *`;
      } catch (e) {
        if (!String(e.message).includes("duplicate")) throw e;
      }
    }
    if (!order) throw new Error("No se pudo generar el código de pedido.");

    for (const ol of orderLines) {
      await sql`INSERT INTO order_items (order_id, name, qty, unit_price_cents, modifiers)
        VALUES (${order.id}, ${ol.name}, ${ol.qty}, ${ol.unit_price_cents}, ${ol.modifiers})`;
    }

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
