# Plan de implementación y auditoría de las 4 interfaces de QuickBite

## Alcance

Este plan aplica únicamente al repositorio:

- aldanajeronimo8-create/QuickBite

No modifica quickbite-core.

Objetivo: consolidar cuatro espacios independientes —Estudiante, Padre/Madre, Staff y Administrador— y después someterlos a pruebas funcionales, de integración y de carga con Grafana k6 usando cuentas de prueba aisladas.

## Estado actual verificado

Actualmente el router expone:

- Estudiante: /menu y rutas /student/*
- Padre/Madre: /parent/*
- Administrador: /admin/*

No se encontró una ruta /staff ni una interfaz Staff conectada al router actual.

La arquitectura existente conserva Supabase como capa de autenticación/datos.

## 1. Definir el contrato de las cuatro interfaces

### Estudiante

Objetivo principal: comprar alimentos.

Flujo crítico de carga:

1. Inicio de sesión.
2. Carga del menú.
3. Selección de productos.
4. Carrito.
5. Confirmación.
6. Creación del pedido.
7. Consulta del estado/historial del pedido.

Debe quedar limitado a sus propios datos y pedidos mediante las políticas existentes.

### Padre/Madre

Objetivo principal: supervisar y gestionar la alimentación del estudiante asociado.

Flujo crítico:

1. Inicio de sesión.
2. Carga de familia/estudiantes asociados.
3. Consulta de información del estudiante.
4. Consulta/configuración de controles alimentarios.
5. Consulta de bienestar y actividad relacionada.

El escenario de compra desde esta interfaz solo se implementará si el flujo funcional existente permite realizar pedidos en nombre del estudiante; no se simulará una operación que la aplicación no soporte.

### Staff

Objetivo principal: operación de cafetería.

Esta será la cuarta interfaz que actualmente falta.

Flujo propuesto:

1. Inicio de sesión Staff.
2. Cola de pedidos activos.
3. Apertura de detalle.
4. Cambio de estado:
   pending -> preparing -> ready -> delivered
5. Consulta de detalles mínimos necesarios para preparar/entregar.
6. Actualización en tiempo real de la cola.
7. Sin acceso a administración de usuarios, configuración global, reportes financieros o estructura académica.

El acceso Staff debe estar separado de Admin tanto por rutas como por autorización.

### Administrador

Objetivo principal: configuración y supervisión global.

Flujo crítico:

1. Inicio de sesión.
2. Dashboard.
3. Pedidos.
4. Menú.
5. Inventario.
6. Usuarios.
7. Reportes/historial.
8. Configuración académica y operativa.

Admin no debe depender de la interfaz Staff para operaciones que solo requieren permisos administrativos.

## 2. Implementar Staff antes de la prueba de carga

Crear:

- Layout Staff.
- Dashboard/cola de pedidos.
- Vista de detalle.
- Acciones de cambio de estado.
- Protección de ruta.
- Control de permisos.
- Navegación y cierre de sesión.
- Suscripción Realtime limitada a lo necesario.
- Pruebas unitarias de autorización.

Rutas objetivo:

- /staff
- /staff/orders
- /staff/orders/:id

La interfaz Staff debe reutilizar servicios/repositorios existentes cuando sea seguro, evitando duplicar acceso a datos.

## 3. Preparar cuentas de prueba aisladas

No utilizar cuentas reales de estudiantes, padres, staff o administradores.

Crear un juego dedicado de fixtures:

- k6.student.01...
- k6.parent.01...
- k6.staff.01...
- k6.admin.01...

Reglas:

- credenciales únicamente como GitHub Actions Secrets/Variables cuando corresponda;
- nunca escribir contraseñas en el repositorio;
- datos identificables de prueba;
- productos y pedidos de prueba claramente marcados;
- limpieza/control de datos tras las pruebas;
- evitar pagos reales.

Para la prueba inicial, usar un entorno y cuentas que permitan generar pedidos sin afectar ventas reales.

## 4. Separar pruebas de aplicación y pruebas de carga

### Prueba funcional

Playwright verificará:

- login correcto por rol;
- redirección correcta;
- navegación;
- acciones principales;
- protección de rutas;
- logout.

### Prueba de carga

k6 medirá las operaciones HTTP y de datos que soportan cada flujo.

No se afirmará que k6 reproduce literalmente clics de navegador: el objetivo será medir capacidad y latencia del backend/HTTP de cada flujo.

## 5. Escenarios k6

Crear una suite modular en tests/k6:

- auth.js
- fixtures.js
- student-flow.js
- parent-flow.js
- staff-flow.js
- admin-flow.js
- four-interfaces.js

### Escenario Student

Carga inicial recomendada:

- 10 VUs
- 25 VUs
- 50 VUs

Operaciones:

- autenticación;
- menú;
- datos del usuario;
- creación de carrito;
- creación de pedido;
- lectura del pedido creado.

### Escenario Parent

Operaciones:

- autenticación;
- familia;
- estudiante asociado;
- controles alimentarios;
- datos de actividad.

### Escenario Staff

Operaciones:

- autenticación;
- lista de pedidos;
- lectura de pedidos activos;
- actualización de estado;
- sincronización/lecturas de cola.

### Escenario Admin

Operaciones:

- autenticación;
- dashboard;
- pedidos;
- menú;
- inventario;
- usuarios.

No ejecutar operaciones destructivas de administración durante la primera prueba de carga.

## 6. Prueba conjunta de las cuatro interfaces

Después de validar cada rol por separado:

- 50% Student
- 20% Parent
- 20% Staff
- 10% Admin

La distribución podrá ajustarse según el comportamiento real de la cafetería.

Objetivo de la prueba:

Simular concurrencia mixta y detectar qué capa se degrada primero:

- autenticación;
- consultas de menú;
- creación de pedidos;
- actualizaciones de estado;
- Realtime;
- Postgres/RLS;
- funciones/RPC;
- frontend/serverless.

## 7. Métricas y umbrales

Mantener como referencia inicial:

- http_req_failed < 2%
- p(95) < 1500 ms
- p(99) < 3000 ms
- checks > 98%

Para operaciones críticas se añadirá un objetivo más estricto después de tener una línea base real.

Además registrar:

- latencia de login;
- latencia de creación de pedido;
- latencia de actualización de estado;
- tasa de errores por endpoint;
- throughput;
- VUs máximos;
- timeouts;
- respuestas 4xx/5xx.

## 8. Auditoría de seguridad durante la prueba

Comprobar explícitamente que:

- Student no puede leer/modificar pedidos de otro Student.
- Parent solo puede acceder a estudiantes realmente asociados.
- Staff no puede entrar a funciones administrativas.
- Admin puede realizar sus operaciones autorizadas.
- Un JWT válido de un rol no concede automáticamente permisos de otro rol.
- Las pruebas no utilizan service-role keys en el cliente.
- RLS bloquea accesos cruzados.

## 9. Escalado por etapas

No empezar con una prueba agresiva en producción.

Orden:

### Etapa A
1 rol a la vez, 10 -> 25 VUs.

### Etapa B
1 rol a la vez, 25 -> 50 VUs.

### Etapa C
4 roles simultáneamente, carga moderada.

### Etapa D
Prueba de capacidad cercana al escenario real de descanso escolar, solo después de validar que las etapas anteriores no generan daño ni datos incoherentes.

## 10. Criterio de corrección

El ciclo será:

inspeccionar -> ejecutar -> detectar -> corregir -> volver a ejecutar -> comparar resultados

No se marcará una etapa como aprobada únicamente porque el frontend responde 200.

Para cada hallazgo se registrará:

- componente afectado;
- operación;
- métrica;
- reproducción;
- causa probable;
- corrección;
- resultado después de corregir.

## 11. CI/CD

La suite k6 se mantendrá en GitHub Actions.

El pipeline deberá:

1. instalar k6;
2. ejecutar la suite seleccionada;
3. publicar el resultado;
4. fallar cuando se incumplan los thresholds;
5. conservar artefactos/resumen cuando una ejecución sea relevante.

La prueba de carga completa no debe ejecutarse automáticamente en cada push si eso puede generar carga innecesaria; se priorizará workflow_dispatch y ejecuciones controladas.

## 12. Resultado final esperado

Al finalizar tendremos:

- 4 interfaces separadas y protegidas.
- 4 flujos funcionales verificables.
- cuentas de prueba aisladas.
- suite k6 por rol.
- escenario mixto de las cuatro interfaces.
- línea base de rendimiento.
- puntos de cuello de botella identificados con métricas reales.
- evidencias de correcciones y re pruebas.

Importante: superar una prueba de 25 VUs no significa que QuickBite soporte una cantidad concreta de estudiantes reales. La capacidad se declarará solamente después de pruebas progresivas y repetibles.
