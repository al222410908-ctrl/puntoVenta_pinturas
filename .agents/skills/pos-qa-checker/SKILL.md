---
name: pos-qa-checker
description: >-
  Use this skill whenever asked to test, run QA, verify types, lint code, or check
  readiness for production/deployment in Pinturas POS.
---

# Skill: Control de Calidad y Pruebas (QA)

Esta habilidad estandariza las comprobaciones necesarias antes de dar por terminada una tarea o realizar un despliegue.

---

## 1. Verificación de Tipos y Build
Ejecuta:
```bash
npm run build
```
- Valida que `tsc -b` no reporte ningún error de TypeScript.
- Comprueba que el bundle de Vite se genere limpiamente en `dist/` junto con el Service Worker de PWA.

---

## 2. Inspección con Oxlint
Ejecuta:
```bash
npm run lint
```
- Oxlint revisa la sintaxis y posibles variables no utilizadas o dependencias faltantes en `useEffect`.
- No debe haber errores bloqueantes.

---

## 3. Pruebas Unitarias
Ejecuta:
```bash
npm run test
```
- Corre la suite de Vitest.
- Asegura que las pruebas de cálculo de totales, cambio y repositorios pasen al 100%.

---

## 4. Checklist Rápido de Negocio
- [ ] ¿Los botones clave son cómodos de presionar en pantalla táctil?
- [ ] ¿Los campos de cantidad admiten fracciones/decimales (ej. 1.5 litros)?
- [ ] ¿La generación de tickets en PDF ([src/lib/ticket.ts](file:///src/lib/ticket.ts)) mantiene los anchos de 58mm/80mm sin desbordar texto?

---

## 5. Regla de Subida a GitHub (`git push`)
- **NUNCA hacer `git push` automáticamente**.
- Toda verificación y prueba debe mostrarse primero al usuario de forma local en `http://localhost:5173/`.
- Preguntar siempre al usuario y obtener su confirmación explícita antes de enviar commits al repositorio remoto de GitHub.
