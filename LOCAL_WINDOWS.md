# Abrir QuickBite local en Windows

## Opcion recomendada

Haz doble clic en:

```text
start-local.bat
```

Ese archivo crea `.env` si no existe, instala dependencias si falta `node_modules` y abre el servidor en:

```text
http://localhost:5173
```

Deja esa ventana abierta. Vite es un servidor de desarrollo y el comando no vuelve al prompt mientras la app esta corriendo. Para detenerlo usa `Ctrl + C`.

## Opcion por terminal PowerShell

En PowerShell usa `npm.cmd`, no `npm`, porque Windows puede bloquear `npm.ps1` por Execution Policy.

```powershell
cd C:\ruta\del\proyecto
copy .env.example .env
npm.cmd install --registry=https://registry.npmjs.org --no-audit --no-fund
npm.cmd run dev:local
```

Luego abre:

```text
http://localhost:5173
```

## Esbuild en Windows

El proyecto incluye un parche automatico para evitar el error:

```text
spawn EPERM
```

El parche se ejecuta solo despues de `npm install` y antes de `npm run dev`, `npm run build`, `npm run start` o `npm run preview`.

Tambien puedes ejecutarlo manualmente:

```powershell
npm.cmd run patch:esbuild
```

## Que se corrigio

El ZIP original venia con un `package-lock.json` generado en Replit que apuntaba a:

```text
package-firewall.replit.local
```

Esa URL solo existe dentro de Replit. En Windows local la instalacion fallaba al intentar resolver esos paquetes. El lockfile fue regenerado contra:

```text
https://registry.npmjs.org
```
