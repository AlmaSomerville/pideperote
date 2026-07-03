import { sql } from "@/lib/db";
import { effectiveOpen, hoursText } from "@/lib/hours";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  let restaurants = null;
  try {
    const rows = await sql`SELECT id, slug, name, logo, cover, color, is_open, hours, schedule,
      delivery, pickup, delivery_fee_cents, min_order_cents
      FROM restaurants WHERE active = TRUE ORDER BY sort, name`;
    restaurants = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      logo: r.logo,
      cover: r.cover,
      color: r.color,
      open: effectiveOpen(r),
      hoursText: hoursText(r),
      delivery: r.delivery,
      pickup: r.pickup,
      deliveryFee: r.delivery_fee_cents,
      minOrder: r.min_order_cents,
    }));
  } catch {}

  return <HomeClient restaurants={restaurants} />;
}
