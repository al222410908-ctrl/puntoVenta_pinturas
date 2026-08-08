# Pinturas POS

Punto de venta (POS) e inventario para un almacén/tienda de pintura y ferretería.

## Características

- **Venta (POS)**: búsqueda por nombre, escaneo de código de barras con la cámara, cantidades fraccionadas (litro/galón/kg/metro), pago mixto efectivo + tarjeta (la terminal solo se registra).
- **Catálogo**: productos, categorías y proveedores. Cada producto tiene precio, costo, stock y stock mínimo.
- **Resurtimiento**: alerta de productos bajo el mínimo y sugerencia de pedido agrupada por proveedor; órdenes de compra pendientes y registro de compras.
- **Inventario**: ajustes manuales (mermas, correcciones) e historial de movimientos.
- **Reportes**: ventas del día/semana/mes, utilidad por producto, y exportación/importación de respaldo.
- **Offline-first (PWA)**: funciona sin internet; los datos viven en el dispositivo (IndexedDB) y la app se instala en el celular.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Dexie (IndexedDB) · vite-plugin-pwa · html5-qrcode

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (TS + Vite + PWA) |
| `npm run preview` | Previsualizar el build |
| `npm run lint` | Oxlint |

## Notas

- Los datos son locales a cada dispositivo. Usa **Reportes → Respaldo** para exportar/importar.
- Pendiente (fase 2): backend en instancia propia con sincronización multi-dispositivo y login.
