# QuickBite — Auditoría 100 %

Este documento es el control de calidad para declarar QuickBite listo para producción.

## Estado de la auditoría

| Área | Estado |
|---|---|
| Typecheck | 🟢 Validado por CI |
| Lint | 🟢 Validado por CI |
| Tests | 🟢 Validado por CI |
| Build | 🟢 Validado por CI |
| Playwright E2E | 🟢 Validado por CI |
| Vercel | 🟢 Despliegue exitoso en el último ciclo validado |
| Supabase / is_admin | 🟢 Permiso sincronizado mediante migración |
| Exportación oficial | 🟢 Excel `.xlsx` |
| Referencias heredadas de Google Sheets | 🟡 En limpieza; el adaptador legacy ya no envía datos a Google |
| Seguridad / RLS con usuarios reales | 🟡 Pendiente de prueba funcional completa |
| Flujos Usuario → Pedido → Admin → Entrega | 🟡 Pendiente de prueba funcional completa |
| Responsive | 🟡 Pendiente de validación visual en dispositivos |
| Dark mode | 🟡 Pendiente de validación visual completa |
| Monitoring de producción | 🟡 Pendiente de confirmar configuración real del health endpoint |

## Regla de aprobación

No se declara 100 % hasta que todas las áreas críticas estén en 🟢 y exista evidencia de prueba.

## Orden de trabajo

1. Consolidar exportación en Excel `.xlsx` y retirar restos de Google Sheets.
2. Validar flujo completo de estudiante.
3. Validar flujo completo de administrador.
4. Validar sincronización de pedidos y estados.
5. Validar RLS y aislamiento entre cuentas.
6. Validar inventario, pagos, cancelaciones y recompensas.
7. Validar Excel: contenido, totales, duplicados y cierre de período.
8. Validar dark mode, logos, responsive y accesibilidad básica.
9. Confirmar health monitoring y recuperación.
10. Ejecutar CI/E2E final y revisar Vercel producción.

## Regla para exportaciones

**Excel es el formato oficial de QuickBite. Google Sheets no debe utilizarse para almacenar ni cerrar las ventas.**
