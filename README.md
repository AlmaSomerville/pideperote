# PidePerote 🍔

Pedidos de comida a domicilio para Álora. Web app móvil-first en Next.js, pensada para Vercel Hobby (coste: 0€/mes).

## Qué incluye

- **Cliente**: lista de restaurantes → carta → opciones ("con ketchup", extras...) → carrito → checkout (nombre, teléfono, dirección) → confirmación con estado en vivo. Pago en efectivo.
- **Portal de restaurante** (`/portal`): pedidos en vivo con sonido, cambiar estados, editar carta completa (categorías, artículos, grupos de opciones), abrir/cerrar, logo, color, horario, coste de reparto, pedido mínimo.
- **Super admin** (`/admin`): crear/desactivar/borrar restaurantes, entrar al portal de cualquiera, ver todos los pedidos y facturación 30 días.
- **Aviso por WhatsApp** al restaurante en cada pedido (Meta Cloud API, opcional — el panel funciona igual sin él).

## Despliegue (GitHub → Vercel)

### 1. Base de datos (Neon, gratis)

1. Crea cuenta en [neon.tech](https://neon.tech) → New Project (región: Frankfurt o la más cercana).
2. Copia la **connection string** (empieza por `postgresql://...`). Es tu `DATABASE_URL`.

### 2. Subir a GitHub

```bash
cd pideperote
git init
git add .
git commit -m "PidePerote v1"
gh repo create pideperote --private --source=. --push
# o sin gh CLI: crea el repo vacío en github.com y:
# git remote add origin git@github.com:TUUSUARIO/pideperote.git
# git push -u origin main
```

### 3. Vercel

1. [vercel.com](https://vercel.com) → Add New → Project → importa el repo `pideperote`.
2. Framework: Next.js (lo detecta solo). No toques nada más.
3. **Environment Variables** antes de darle a Deploy:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la connection string de Neon |
| `ADMIN_PASSWORD` | tu contraseña de super admin |
| `AUTH_SECRET` | cualquier cadena larga aleatoria |

4. Deploy.

### 4. Crear las tablas

Visita una sola vez:

```
https://TU-APP.vercel.app/api/setup?password=TU_ADMIN_PASSWORD
```

Crea las tablas y un restaurante de ejemplo (portal: `bar-ejemplo` / `ejemplo123`). Bórralo desde `/admin` cuando tengas restaurantes reales.

### 5. Listo

- Clientes: `https://TU-APP.vercel.app`
- Restaurantes: `/portal` (les das su slug + contraseña desde `/admin`)
- Tú: `/admin`

## WhatsApp (opcional, después)

Sin configurar nada, los restaurantes ven los pedidos en su panel (suena una alarma con la pestaña abierta). Para el aviso por WhatsApp:

1. [developers.facebook.com](https://developers.facebook.com) → crear app → producto "WhatsApp".
2. Consigue un **token permanente** y el **Phone Number ID** del número de envío.
3. En Vercel añade `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID`.
4. **Importante**: Meta solo deja enviar texto libre dentro de la "ventana de 24h" (si el restaurante escribió al número hace <24h). Para producción crea una **plantilla** aprobada (ej. `nuevo_pedido` con una variable `{{1}}`) y añade `WHATSAPP_TEMPLATE=nuevo_pedido` en Vercel.
5. El número de cada restaurante se pone desde `/admin` → su portal → Ajustes.

## Notas técnicas

- Los precios se recalculan siempre en el servidor; el cliente no puede manipular totales.
- Los logos se redimensionan a 256px en el navegador y se guardan en la BD (sin necesidad de storage externo).
- Sesiones: cookie firmada HMAC, 30 días. El admin puede entrar a cualquier portal con `/portal?rid=X`.
- Pedidos visibles en portal: últimas 48h. Todo queda en la BD para histórico.

## Desarrollo local

```bash
npm install
echo 'DATABASE_URL=postgresql://...' > .env.local
echo 'ADMIN_PASSWORD=test123' >> .env.local
npm run dev
```
