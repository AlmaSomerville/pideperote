import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { availability } from "@/lib/slots";

export const dynamic = "force-dynamic";

// GET /api/slots?rid=X → { asapOk, slots: [{t, label}] }
export async function GET(req) {
  const rid = Number(new URL(req.url).searchParams.get("rid"));
  if (!rid) return NextResponse.json({ error: "Falta rid" }, { status: 400 });
  const [rest] = await sql`SELECT * FROM restaurants WHERE id = ${rid} AND active = TRUE`;
  if (!rest) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const { asapOk, slots } = await availability(rest);
  return NextResponse.json({ asapOk, slots: slots.slice(0, 16) });
}
