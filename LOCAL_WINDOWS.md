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

## Arranque estable

Los comandos de desarrollo usan Vite con una capa temporal de compatibilidad para Windows. No modifica `node_modules` ni deja cambios persistentes: solo evita los errores `spawn EPERM` y la comprobacion de unidades de red mientras Vite esta en ejecucion. La cache se guarda dentro de las dependencias y se puede regenerar con una instalacion limpia si alguna vez es necesario.

## Que se corrigio

El ZIP original venia con un `package-lock.json` generado en un entorno privado que apuntaba a:

```text
un registro interno no accesible desde internet
```

Ese registro no es accesible desde un equipo local. En Windows la instalacion fallaba al intentar resolver los paquetes. El lockfile fue regenerado contra:

```text
https://registry.npmjs.org
```
