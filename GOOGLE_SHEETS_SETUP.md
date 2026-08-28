# Cierre de pagos hacia Google Sheets

Esta integración usa **Google Apps Script como intermediario**. El navegador solo se comunica con
el servidor de QuickBite; la URL del Script y el secreto compartido viven exclusivamente en las
variables de entorno del servidor. No se usan claves privadas de Google ni secretos en Vite.

## 1. Aplicar la migración

Aplica `supabase/migrations/20260827000000_sales_export_batches.sql` con el proceso habitual de
migraciones. La migración agrega marcas de exportación a `orders`; no elimina ningún pedido.

## 2. Preparar la hoja de cálculo

1. Crea un archivo de Google Sheets para el historial de la cafetería.
2. En **Extensiones → Apps Script**, pega el contenido de `google-apps-script/Code.gs`.
3. En **Project Settings → Script properties**, crea `EXPORT_SHARED_SECRET` con una cadena larga
   aleatoria. No incluyas este valor en el frontend ni lo subas a Git.
4. En **Deploy → New deployment**, selecciona **Web app**, ejecuta como la cuenta propietaria de la
   hoja y permite acceso únicamente a quien corresponda a tu organización. Copia la URL `/exec`.

## 3. Configurar el servidor

En los secretos del servidor que ejecuta `supabase/functions/server/index.tsx`, configura:

```text
GOOGLE_SHEETS_WEB_APP_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_SHARED_SECRET=<el mismo valor de EXPORT_SHARED_SECRET>
```

También establece en el frontend la URL pública del servidor, sin una barra final:

```text
VITE_API_BASE_URL=https://tu-servidor-quickbite.example
```

Reinicia/despliega tanto el servidor como la aplicación tras cambiar las variables.

## Garantías del cierre

El servidor valida la sesión y el rol de administrador, prepara únicamente pedidos sin
`exported_at`, envía las filas a Sheets y valida `exportId` y el número de filas recibidas. Solo
entonces marca los pedidos con `exported_at` y `export_batch_id`. La pantalla de pagos muestra
solo pedidos sin exportar, por lo que el nuevo periodo queda en cero sin borrar la historia de los
estudiantes. Un lote pendiente conserva el mismo ID durante un reintento, y Apps Script lo trata
como idempotente para no duplicar filas.
