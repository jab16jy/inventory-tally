# Conteo de Inventario

Glosario del dominio de conteo-eficiente: conteo de inventario por categoría de valor, colaborativo entre cajeros y offline-first.

## Language

### Primitivos de UI

Los ocho bloques visuales base del sistema de diseño.

**Placa**:
El bloque-rótulo base de una fila o tarjeta, con la señal de si su contenido está confirmado por el servidor.

**Numeral**:
La tipografía reservada a toda cifra y denominación del sistema.

**BotonPaso**:
El control para sumar o restar unidades de una categoría, un paso a la vez.

**BarraProgreso**:
La indicación de cuántas categorías ya contó el cajero sobre el total de la sesión.

**Deck**:
El bloque fijo con los totales de unidades y la acción de finalizar el conteo.

**Hoja**:
El panel que sube desde abajo para capturar la cantidad de una categoría.

**ChipEstado**:
La señal del estado de sincronización: sincronizado, pendiente o sin conexión.

**Icono**:
El catálogo de símbolos gráficos propios del sistema.

### Sesiones

**Sesión de conteo**:
El período en que uno o más cajeros cuentan una sucursal, abierto y cerrado por un administrador.
_Avoid_: sesión (a secas), cuando pueda confundirse con la sesión de autenticación.

**Sesión de autenticación**:
La sesión de un usuario autenticado en la app, independiente de si hay una sesión de conteo abierta.
_Avoid_: cerrar sesión (a secas), cuando pueda confundirse con el cierre de una sesión de conteo.
