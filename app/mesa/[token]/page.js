import { sql } from "@/lib/db";
import { effectiveOpen } from "@/lib/hours";
import MesaClient from "./MesaClient";

export const dynamic = "force-dynamic";

export default async function MesaPage({ params }) {
  const [t] = await sql`SELECT t.id, t.label, r.id AS rid, r.name, r.cover, r.color,
      r.is_open, r.schedule
    FROM tables t JOIN restaurants r ON r.id = t.restaurant_id
    WHERE t.token = ${params.token} AND r.active = TRUE`;

  if (!t)
    return (
      <main className="wrap confirm-box">
        <div className="big-icon">🤔</div>
        <h1>Este QR ya no vale</h1>
        <p className="muted">
          Puede que el bar haya renovado los códigos de sus mesas. Avisa al camarero y te ayudará.
        </p>
      </main>
    );

  const restaurant = {
    id: t.rid,
    name: t.name,
    cover: t.cover,
    color: t.color,
    is_open: effectiveOpen(t),
  };

  const categories = await sql`SELECT id, name FROM categories WHERE restaurant_id = ${t.rid} ORDER BY sort, id`;
  const items = await sql`SELECT id, category_id, name, description, price_cents, available
    FROM items WHERE restaurant_id = ${t.rid} ORDER BY sort, id`;
  const itemIds = items.map((i) => i.id);
  const groups = itemIds.length
    ? await sql`SELECT id, item_id, name, min_select, max_select FROM modifier_groups
        WHERE item_id = ANY(${itemIds}) ORDER BY sort, id`
    : [];
  const groupIds = groups.map((g) => g.id);
  const options = groupIds.length
    ? await sql`SELECT id, group_id, name, price_delta_cents FROM modifier_options
        WHERE group_id = ANY(${groupIds}) ORDER BY sort, id`
    : [];

  const menu = categories.map((c) => ({
    ...c,
    items: items
      .filter((i) => i.category_id === c.id)
      .map((i) => ({
        ...i,
        groups: groups
          .filter((g) => g.item_id === i.id)
          .map((g) => ({ ...g, options: options.filter((o) => o.group_id === g.id) })),
      })),
  }));

  return <MesaClient restaurant={restaurant} menu={menu} token={params.token} />;
}
