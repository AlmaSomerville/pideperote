import { NextResponse } from "next/server";
import { createSchema, seedDemo } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/setup?password=XXXX  (o POST {password})
// Crea las tablas y un restaurante de ejemplo. Se puede ejecutar varias veces sin peligro.
export async function GET(req) {
  const password = new URL(req.url).searchParams.get("password");
  return run(password);
}
export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  return run(password);
}

async function run(password) {
  if (!process.env.ADMIN_PASSWORD)
    return NextResponse.json({ error: "Configura ADMIN_PASSWORD en Vercel primero." }, { status: 500 });
  if (password !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  try {
    await createSchema();
    const seeded = await seedDemo();
    return NextResponse.json({
      ok: true,
      seeded,
      message: seeded
        ? "Tablas creadas y restaurante de ejemplo añadido (portal: bar-ejemplo / ejemplo123)."
        : "Tablas verificadas. Ya había datos, no se ha añadido nada.",
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
