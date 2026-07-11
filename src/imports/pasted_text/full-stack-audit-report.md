Actúa como un arquitecto de software senior, ingeniero DevOps, experto en React, TypeScript, Supabase, PostgreSQL y seguridad web.

Analiza TODO el proyecto de manera exhaustiva, archivo por archivo, sin omitir ningún detalle.

No hagas una revisión superficial.

Quiero una auditoría técnica completa como si la aplicación fuera a entrar a producción para una empresa.

Objetivo
Convertir este proyecto en una aplicación completamente profesional, escalable, segura y lista para producción.

Analiza absolutamente todo
Arquitectura
Organización del proyecto
Escalabilidad
Patrones de diseño
Separación de responsabilidades
Acoplamiento
Reutilización de componentes
Código duplicado
Estructura de carpetas
Modularización
React
Analiza:

renders innecesarios
useEffect incorrectos
useMemo
useCallback
React.memo
Context
Zustand
Lazy Loading
Suspense
Code Splitting
Performance
TypeScript
Revisa:

tipos incorrectos
any innecesarios
interfaces
generics
tipos repetidos
seguridad de tipos
Supabase
Analiza completamente:

Base de datos
Relaciones
Foreign Keys
Índices
Triggers
Funciones
Vistas
Políticas RLS
Auth
Storage
Realtime
Migraciones
Busca cualquier vulnerabilidad.

Corrige cualquier política RLS insegura.

Seguridad
Busca:

SQL Injection
XSS
CSRF
validaciones inexistentes
permisos inseguros
exposición de datos
secretos en el código
API Keys
Variables de entorno
JWT
autenticación
autorización
Rendimiento
Optimiza:

consultas SQL
consultas repetidas
renders
bundle size
imágenes
lazy loading
caché
paginación
virtualización
memoización
Manejo de errores
Implementa un sistema profesional.

Debe incluir:

Error Boundaries
manejo centralizado
logs
mensajes amigables
recuperación automática
reintentos
Logs
Agregar un sistema profesional de auditoría.

Registrar:

inicio de sesión
cierre de sesión
creación
edición
eliminación
pagos
pedidos
errores
accesos
Monitoreo
Preparar integración para:

Sentry
PostHog
OpenTelemetry
Debe quedar desacoplado para poder cambiar de proveedor fácilmente.

Testing
Crear:

Unit Testing
Integration Testing
End to End Testing
Usar:

Vitest
Playwright
Generar una cobertura alta.

Calidad del código
Aplicar:

ESLint
Prettier
Husky
lint-staged
Eliminar:

código muerto
componentes sin uso
archivos temporales
imports innecesarios
UI / UX
Analiza:

accesibilidad
responsive
dark mode
navegación
consistencia
componentes reutilizables
feedback visual
loaders
skeletons
animaciones
Escalabilidad
Preparar la aplicación para miles de usuarios concurrentes.

Optimizar:

consultas
arquitectura
estado global
almacenamiento
caché
DevOps
Preparar:

Docker
Docker Compose
CI/CD
GitHub Actions
Variables de entorno
Ambientes Development
Staging
Production
Base de datos
Optimizar:

índices
constraints
normalización
rendimiento
consistencia
Backups
Implementar estrategia para:

Backups automáticos
Restauración
Versionado
Recuperación ante desastres
Documentación
Generar:

README profesional
Arquitectura
Instalación
Deployment
API
Variables de entorno
Guía para desarrolladores
Muy importante
Desvincula completamente el proyecto de cualquier recurso específico del desarrollador original.

El proyecto debe quedar agnóstico, reutilizable y listo para que cualquier persona pueda desplegarlo con su propia infraestructura.

GitHub
Eliminar cualquier dependencia hacia:

repositorios
URLs
workflows ligados a un repositorio específico
nombres de usuario
organizaciones
Permitir que el usuario conecte posteriormente su propio repositorio GitHub si así lo desea.

Supabase
Eliminar cualquier dependencia hacia:

Project ID
URLs
API Keys
Service Keys
Secrets
Buckets específicos
Storage ligado a un proyecto existente
La aplicación debe detectar que no existe configuración y ofrecer un asistente para:

conectar un proyecto Supabase existente, o
crear uno nuevo manualmente.
Dominios
No dejar ningún dominio fijo.

Todo debe configurarse mediante variables de entorno o un archivo de configuración.

Debe permitir conectar posteriormente:

dominio principal
subdominios
certificados SSL
CDN
sin modificar el código fuente.

Variables de entorno
Centralizar toda la configuración en archivos .env.example, sin incluir secretos reales.

Configurar, entre otros:

Base de datos
Supabase
URLs
API Keys
Storage
Email
Notificaciones
Monitoreo
Analytics
Configuración inicial
Crear un asistente de primer inicio que permita al usuario:

Configurar la aplicación.
Elegir el proveedor de base de datos (si se soportan varios).
Conectar o configurar Supabase.
Crear el primer administrador.
Configurar dominio.
Configurar correo.
Configurar almacenamiento.
Finalizar la instalación.
La aplicación no debe depender de ningún recurso preconfigurado del proyecto original.

Entregables
Para cada mejora:

Explicar el problema.
Explicar el riesgo.
Explicar la solución.
Mostrar el código corregido.
Justificar la decisión técnica.
Indicar el impacto en rendimiento y seguridad.
Al finalizar, generar:

Calificación por categoría.
Calificación global sobre 100.
Lista priorizada de problemas críticos.
Lista de mejoras recomendadas.
Plan de implementación por fases (crítico, importante y opcional).
Estado final indicando qué tan cerca está el proyecto de un entorno de producción empresarial.
