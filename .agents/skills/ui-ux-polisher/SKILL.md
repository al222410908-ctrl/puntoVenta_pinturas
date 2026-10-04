---
name: ui-ux-polisher
description: >-
  Use this skill whenever the user asks to improve, polish, redesign, modernize,
  or enhance the visual UI, UX, responsive layouts, dark mode, or mobile touch
  experience of any screen or component in the Pinturas POS app.
---

# Skill: UI/UX Polisher & Design System

Esta habilidad guía la mejora visual de cualquier interfaz dentro de **Pinturas POS**, asegurando armonía estética, usabilidad en pantallas táctiles y consistencia de marca.

---

## 1. Tokens de Diseño y Colores Oficiales

Toda interfaz debe utilizar estrictamente las clases y variables declaradas en [src/index.css](file:///src/index.css):

| Elemento | Clases de Tailwind / CSS | Propósito |
| :--- | :--- | :--- |
| **Acciones Principales / Header** | `bg-primary`, `hover:bg-primary-700`, `text-white` | Pino profundo institucional (`#174a3b`) |
| **Cobro / Destacados / CTA** | `.btn-accent` o `bg-accent text-[#241d05]` | Ocre/ámbar de alta visibilidad (`#c5982a`) |
| **Contenedores y Tarjetas** | `.card` | Fondo blanco con borde sutil y sombra limpia |
| **Campos de Entrada** | `.input` | Input estilizado con foco en verde pino |
| **Estados / Chips** | `.chip-ok` (verde), `.chip-warn` (ámbar), `.chip-bad` (rojo), `.chip-info` (azul), `.chip-devol` (morado) | Badges de stock, pagos y estados |

---

## 2. Ergonomía de Punto de Venta (Táctil y Celular)

Dado que la aplicación funciona como **PWA en celulares y tabletas de mostrador**:
- **Hit targets grandes**: Botones de acción rápida (Cobrar, Agregar, Cantidad +/-) con altura mínima `h-11` o `min-h-[44px]` para presionar sin error con el pulgar.
- **Precios legibles a distancia**: Aplica siempre `tabular-nums font-bold text-xl` o superior en subtotales, totales y cambio.
- **Espaciado generoso**: Evita botones pegados (`gap-3` o `gap-4`).

---

## 3. Modo Oscuro Impecable (`.dark`)

- La app soporta tema claro y oscuro con `@custom-variant dark`.
- Al rediseñar cualquier componente:
  - Textos secundarios en claro: `text-slate-500` / en oscuro: `dark:text-slate-400`.
  - Fondos de tarjetas en claro: `bg-white` / en oscuro: `dark:bg-slate-800`.
  - Bordes en claro: `border-slate-200` / en oscuro: `dark:border-slate-700/60`.
  - Nunca uses negro puro `#000000` plano para fondos grandes; usa `dark:bg-slate-950`.

---

## 4. Micro-animaciones y Feedback

- **Botones**: Añade siempre feedback táctil `active:scale-[0.98] transition-all duration-150`.
- **Modales**: Usar fondos con desenfoque (`backdrop-blur-sm bg-black/40 animate-fade-in`).
- **Estados vacíos**: En lugar de listas en blanco, muestra un ícono de `lucide-react`, un título descriptivo y un botón de acción sugerida.
