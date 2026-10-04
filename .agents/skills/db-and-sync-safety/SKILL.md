---
name: db-and-sync-safety
description: >-
  Use this skill whenever modifying Dexie schemas, IndexedDB tables in src/db/db.ts,
  repositories in src/db/repos.ts, or the sync pipeline in api/sync.mjs and src/lib/sync.ts.
---

# Skill: Seguridad en Base de Datos Local y Sincronización

Esta habilidad asegura que ninguna actualización de código rompa la persistencia local de los clientes ni cause pérdida de ventas en modo offline.

---

## 1. Reglas para Modificar el Esquema de Dexie (`src/db/db.ts`)

- **NUNCA modificar un `.version(N)` existente**: Si cambias los índices de una versión ya desplegada, los navegadores de los clientes lanzarán errores de schema y se bloqueará el acceso a los datos.
- **Flujo para agregar campos indexados o tablas**:
  ```typescript
  // En src/db/db.ts
  // 1. Mantener las versiones anteriores intactas
  this.version(1).stores({ ... });

  // 2. Definir una nueva versión con el delta o nuevo esquema:
  this.version(2).stores({
    products: 'id, name, barcode, category_id, updated_at', // si se agregó un índice
    new_table: 'id, created_at, synced'                     // si se agregó una tabla
  });
  ```

---

## 2. Operaciones Atómicas en Repositorios (`src/db/repos.ts`)

- **Ventas y Descuento de Stock**: Toda venta debe descontar el stock de los productos dentro de una transacción (`db.transaction('rw', [db.sales, db.products], async () => { ... })`).
- **Estado de Sincronización**:
  - Al insertar o actualizar registros localmente, asigna `synced: 0` (o `false`) y actualiza `updated_at: new Date().toISOString()`.
  - Solo cuando el backend en `api/sync.mjs` confirme la recepción, se marca `synced: 1`.

---

## 3. Protocolo de Sincronización (`api/sync.mjs` y `src/lib/sync.ts`)

- Asegurar que la función de sincronización maneje los siguientes casos:
  1. **Sin conexión (offline)**: Capturar el fallo de red sin mostrar alertas invasivas ni interrumpir la venta.
  2. **Resolución de conflictos**: La marca de tiempo `updated_at` más reciente gana (Last-Write-Wins) a menos que se trate de movimientos de caja o ventas acumuladas.
