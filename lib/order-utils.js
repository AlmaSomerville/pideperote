import { sql } from "@/lib/db";

// Helpers compartidos entre /api/order (reparto/recogida) y /api/mesa (pedidos en mesa),
// para que ambos pasen por la misma lógica de precios e inserción.

function makeCode() {
  return "PP-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// Recalcula los precios de las líneas en el servidor (nunca confiar en el cliente).
// Devuelve { error } o { subtotal, orderLines }.
export async function priceLines(restaurantId, lines) {
  const itemIds = [...new Set(lines.map((l) => Number(l.itemId)))];
  const items = await sql`SELECT id, name, price_cents, available FROM items
    WHERE id = ANY(${itemIds}) AND restaurant_id = ${restaurantId}`;
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
      return { error: `"${item?.name || "Un artículo"}" ya no está disponible.` };
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
  return { subtotal, orderLines };
}

// Inserta el pedido (reintentando si el código aleatorio choca) y sus líneas.
export async function insertOrder(f, orderLines) {
  let order = null;
  for (let i = 0; i < 5 && !order; i++) {
    try {
      [order] = await sql`INSERT INTO orders
        (code, restaurant_id, customer_name, phone, address, notes, type, total_cents,
         delivery_fee_cents, scheduled_for, table_id, table_label, pay_method)
        VALUES (${makeCode()}, ${f.restaurantId}, ${f.customerName}, ${f.phone || ""},
                ${f.address || ""}, ${f.notes || ""}, ${f.type}, ${f.totalCents},
                ${f.deliveryFeeCents || 0}, ${f.scheduledFor || null},
                ${f.tableId || null}, ${f.tableLabel || ""}, ${f.payMethod || "efectivo"})
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
  return order;
}
