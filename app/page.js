import Link from "next/link";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getRestaurants() {
  try {
    return await sql`SELECT id, slug, name, logo, color, is_open, hours FROM restaurants WHERE active = TRUE ORDER BY is_open DESC, sort, name`;
  } catch {
    return null;
  }
}

export default async function Home() {
  const restaurants = await getRestaurants();

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="wordmark">
          pideperote<span className="dot">.</span>
        </div>
      </div>
      <p className="tagline">Comida de Álora, a tu puerta. Pagas en efectivo al recibir.</p>

      {restaurants === null && (
        <div className="panel">
          <h3>Falta configurar la base de datos</h3>
          <p className="muted">
            Añade <code>DATABASE_URL</code> en Vercel y visita <code>/api/setup</code> con la
            contraseña de admin para crear las tablas.
          </p>
        </div>
      )}

      {restaurants?.length === 0 && (
        <div className="panel">
          <h3>Todavía no hay restaurantes</h3>
          <p className="muted">Entra en /admin para añadir el primero.</p>
        </div>
      )}

      <div className="rest-grid">
        {restaurants?.map((r) => (
          <Link
            key={r.id}
            href={`/r/${r.slug}`}
            className={`rest-card ${r.is_open ? "" : "closed"}`}
            style={{ "--rc": r.color }}
          >
            <div className="rest-logo">
              {r.logo ? <img src={r.logo} alt="" /> : r.name.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rest-name">{r.name}</div>
              {r.hours && <div className="rest-meta">{r.hours}</div>}
            </div>
            <span className={`badge ${r.is_open ? "open" : "shut"}`}>
              {r.is_open ? "Abierto" : "Cerrado"}
            </span>
          </Link>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 40, textAlign: "center" }}>
        <Link href="/portal">Acceso restaurantes</Link>
      </p>
    </main>
  );
}
