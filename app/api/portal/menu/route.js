import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRestaurant } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST { rid, action, ...payload } — edición de menú estilo RPC para mantenerlo simple.
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const rid = Number(b.rid);
  if (!rid || !requireRestaurant(rid))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const t = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const cents = (v) => Math.max(0, Math.round(Number(v) || 0));

  try {
    switch (b.action) {
      case "category.add": {
        const [row] = await sql`INSERT INTO categories (restaurant_id, name, sort)
          VALUES (${rid}, ${t(b.name)}, ${Number(b.sort) || 0}) RETURNING *`;
        return NextResponse.json({ row });
      }
      case "category.update":
        await sql`UPDATE categories SET name = ${t(b.name)}, sort = ${Number(b.sort) || 0}
          WHERE id = ${Number(b.id)} AND restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });
      case "category.delete":
        await sql`DELETE FROM categories WHERE id = ${Number(b.id)} AND restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });

      case "item.add": {
        const [cat] = await sql`SELECT id FROM categories WHERE id = ${Number(b.categoryId)} AND restaurant_id = ${rid}`;
        if (!cat) return NextResponse.json({ error: "Categoría no válida" }, { status: 400 });
        const [row] = await sql`INSERT INTO items (restaurant_id, category_id, name, description, price_cents, sort)
          VALUES (${rid}, ${cat.id}, ${t(b.name)}, ${t(b.description, 500)}, ${cents(b.priceCents)}, ${Number(b.sort) || 0})
          RETURNING *`;
        return NextResponse.json({ row });
      }
      case "item.update":
        await sql`UPDATE items SET name = ${t(b.name)}, description = ${t(b.description, 500)},
          price_cents = ${cents(b.priceCents)}, available = ${!!b.available}, sort = ${Number(b.sort) || 0}
          WHERE id = ${Number(b.id)} AND restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });
      case "item.toggle":
        await sql`UPDATE items SET available = NOT available WHERE id = ${Number(b.id)} AND restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });
      case "item.delete":
        await sql`DELETE FROM items WHERE id = ${Number(b.id)} AND restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });

      case "group.add": {
        const [it] = await sql`SELECT id FROM items WHERE id = ${Number(b.itemId)} AND restaurant_id = ${rid}`;
        if (!it) return NextResponse.json({ error: "Artículo no válido" }, { status: 400 });
        const min = Math.max(0, Number(b.min) || 0);
        const max = Math.max(min || 1, Number(b.max) || 1);
        const [row] = await sql`INSERT INTO modifier_groups (item_id, name, min_select, max_select)
          VALUES (${it.id}, ${t(b.name)}, ${min}, ${max}) RETURNING *`;
        return NextResponse.json({ row });
      }
      case "group.update": {
        const min = Math.max(0, Number(b.min) || 0);
        const max = Math.max(min || 1, Number(b.max) || 1);
        await sql`UPDATE modifier_groups g SET name = ${t(b.name)}, min_select = ${min}, max_select = ${max}
          FROM items i WHERE g.id = ${Number(b.id)} AND i.id = g.item_id AND i.restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });
      }
      case "group.delete":
        await sql`DELETE FROM modifier_groups g USING items i
          WHERE g.id = ${Number(b.id)} AND i.id = g.item_id AND i.restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });

      case "option.add": {
        const [g] = await sql`SELECT g.id FROM modifier_groups g JOIN items i ON i.id = g.item_id
          WHERE g.id = ${Number(b.groupId)} AND i.restaurant_id = ${rid}`;
        if (!g) return NextResponse.json({ error: "Grupo no válido" }, { status: 400 });
        const [row] = await sql`INSERT INTO modifier_options (group_id, name, price_delta_cents)
          VALUES (${g.id}, ${t(b.name)}, ${cents(b.deltaCents)}) RETURNING *`;
        return NextResponse.json({ row });
      }
      case "option.update":
        await sql`UPDATE modifier_options o SET name = ${t(b.name)}, price_delta_cents = ${cents(b.deltaCents)}
          FROM modifier_groups g, items i
          WHERE o.id = ${Number(b.id)} AND g.id = o.group_id AND i.id = g.item_id AND i.restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });
      case "option.delete":
        await sql`DELETE FROM modifier_options o USING modifier_groups g, items i
          WHERE o.id = ${Number(b.id)} AND g.id = o.group_id AND i.id = g.item_id AND i.restaurant_id = ${rid}`;
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Error en la operación" }, { status: 500 });
  }
}
