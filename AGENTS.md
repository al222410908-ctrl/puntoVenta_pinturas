# Reglas del Proyecto - Pinturas POS

Este archivo define las convenciones de arquitectura, desarrollo y diseño para cualquier agente que trabaje en este repositorio.

---

## 1. Stack Tecnológico

- **Frontend**: React 19 + TypeScript (estricto) + Vite 8.
- **Estilos**: **Tailwind CSS v4** mediante `@tailwindcss/vite`.
  - **IMPORTANTE**: No crear `tailwind.config.js` ni configurar PostCSS clásico. Todo se configura en [src/index.css](file:///src/index.css) con directivas `@theme`.
- **Persistencia Local**: **Dexie.js (IndexedDB)**. Arquitectura *offline-first*.
- **Backend / API**: Funciones serverless de Vercel en `api/*.mjs` conectadas a PostgreSQL/Supabase.
- **Linter & Test**:
  - Linter: `npm run lint` (utiliza **Oxlint**, no ESLint).
  - Pruebas: `npm run test` (utiliza **Vitest**).
  - Build: `npm run build` (`tsc -b && vite build`).

---

## 2. Reglas de Base de Datos y Offline-First

- **Integridad de Esquemas**: La base de datos local vive en [src/db/db.ts](file:///src/db/db.ts). Si se agregan columnas indexadas o nuevas tablas, **siempre** se debe crear un nuevo bloque `.version(N)` para no romper la base de datos de los dispositivos de los usuarios.
- **Acceso a Datos**: Todo acceso a Dexie debe residir en los repositorios de [src/db/repos.ts](file:///src/db/repos.ts).
- **Sincronización**: Toda entidad que se sincronice con el servidor debe mantener `id`, `updated_at` y el estado de sincronización (`synced`).

---

## 3. Reglas de Negocio (POS)

- **Unidades Fraccionadas**: Las pinturas y artículos de ferretería se venden por litro, galón, kg, metro o pieza. Las cantidades en ventas, compras y mermas deben admitir decimales.
- **Cortes de Caja y Tickets**: Los archivos [src/lib/ticket.ts](file:///src/lib/ticket.ts) y [src/lib/cashCutTicket.ts](file:///src/lib/cashCutTicket.ts) deben generar PDFs optimizados para impresoras térmicas (58mm / 80mm).
- **Disponibilidad Offline**: Las operaciones críticas (ventas, cobros, consulta de catálogo) nunca deben bloquearse si no hay conexión a internet.

---

## 4. Estándar de Diseño UI/UX

- **Paleta Oficial**:
  - Color Primario (Pino profundo): `bg-primary` (`#174a3b`), `hover:bg-primary-700`.
  - Color Acento / Cobro / Alertas (Ocre): `btn-accent` / `bg-accent` (`#c5982a`).
  - Superficie y Fondos: `bg-surface` (`#f6f1e7`) para fondo cálido en modo claro, `dark:bg-slate-950` en modo oscuro.
- **Clases del Sistema** (en [src/index.css](file:///src/index.css)):
  - `.card` para contenedores.
  - `.input` y `.label` para formularios.
  - `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-accent`, `.btn-danger`, `.btn-ghost`.
  - Chips de estado: `.chip-ok`, `.chip-warn`, `.chip-bad`, `.chip-info`, `.chip-devol`.
- **Ergonomía Táctil**:
  - Botones clave (Cobrar, Agregar, Confirmar) con altura mínima `h-11` o `py-3` para pantallas táctiles y celulares.
  - Números y totales en formato tabular: `tabular-nums font-bold text-xl`.
