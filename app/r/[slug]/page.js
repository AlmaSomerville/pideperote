import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { effectiveOpen, hoursText, nextOpeningText } from "@/lib/hours";
import MenuClient from "./MenuClient";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({ params }) {
  const [rest] = await sql`SELECT id, slug, name, logo, cover, color, is_open, hours, schedule,
    delivery, pickup, delivery_fee_cents, min_order_cents
    FROM restaurants WHERE slug = ${params.slug} AND active = TRUE`;
  if (!rest) notFound();

  const open = effectiveOpen(rest);
  rest.preorder = !open && !!nextOpeningText(rest); // cerrado por horario => se puede programar
  rest.opensAt = open ? "" : nextOpeningText(rest);
  rest.is_open = open;
  rest.hours = hoursText(rest);
  delete rest.schedule;

  const categories = await sql`SELECT id, name FROM categories WHERE restaurant_id = ${rest.id} ORDER BY sort, id`;
  const items = await sql`SELECT id, category_id, name, description, price_cents, available
    FROM items WHERE restaurant_id = ${rest.id} ORDER BY sort, id`;
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

  return <MenuClient restaurant={rest} menu={menu} />;
}
