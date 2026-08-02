# Fase de Exploración Tecnológica

## Proyecto: conteoDeProductosEficiente

> **⚠️ Documento histórico, no es el diseño vigente.** Esta fase priorizó Flutter/Dart como
> app móvil multiplataforma (Android + iOS nativos). El diseño evolucionó primero a un
> esquema Android nativo + PWA ([13 · ADR-11](13-decisiones-adr.md#adr-11)) y después a
> **una única aplicación web (React + Vite + TypeScript), sin ningún cliente nativo**
> ([13 · ADR-15](13-decisiones-adr.md#adr-15)). El backend descrito aquí (Firebase:
> Authentication + Firestore) sigue vigente; el framework de cliente y la estrategia de
> distribución, no. Ver [README](README.md) para el estado actual del diseño.

## 1. Descripción general del proyecto

**conteoDeProductosEficiente** es una aplicación móvil pensada para negocios con varias sucursales, donde el conteo de inventario producto por producto resulta lento e ineficiente. En su lugar, el sistema permite contar el inventario agrupando los productos por su **valor o precio de venta**, sin importar de qué producto se trate ni cuál sea su rango de precio.

Todos los valores —desde los más bajos hasta los más altos— se manejan bajo la **misma estructura de conteo**: el trabajador selecciona un valor, registra la cantidad encontrada y el sistema calcula el subtotal correspondiente. No existe una plantilla separada para productos de mayor precio; el sistema debe ser capaz de administrar cualquier valor definido por el negocio dentro de un único flujo de trabajo.

El sistema permitirá que varios trabajadores realicen el conteo desde diferentes dispositivos, viendo los cambios reflejados en tiempo real. Cada conteo quedará asociado a una sucursal específica y contará con trazabilidad completa mediante un módulo de auditoría.

Adicionalmente, el sistema incorporará un módulo de **análisis de inventario**, que mostrará información relevante para la toma de decisiones: existencias por categoría de valor, categoría con mayor cantidad de unidades, participación de cada valor dentro del inventario total, entre otros datos útiles para graficar y entender el estado del negocio de un vistazo.

---

## 2. Objetivo de la fase de exploración

Definir las tecnologías más adecuadas para construir una aplicación móvil multiplataforma, con sincronización en tiempo real entre dispositivos, capacidad de auditoría completa y un módulo de análisis de datos, priorizando **Flutter** como tecnología principal de desarrollo.

Esta fase permite establecer qué herramientas se usarán, por qué se usarán, y cómo se organizará el proyecto internamente mediante una **arquitectura por capas**, adecuada para el tamaño y la complejidad actual del sistema.

---

## 3. Alcance funcional del sistema

### 3.1 Conteo unificado por valor

El sistema maneja el conteo por valores/precios definidos por el negocio, sin distinción entre valores bajos y altos. Un mismo flujo de trabajo permite registrar cantidad para cualquier valor, ya sea $1.000 o $150.000: se selecciona el valor (o se crea uno nuevo si el negocio lo requiere), se ingresa la cantidad contada, y el sistema calcula automáticamente el subtotal.

Esto simplifica la aplicación, evita mantener dos lógicas de conteo distintas y facilita el mantenimiento futuro del sistema.

### 3.2 Gestión de usuarios y sucursales

- Inicio de sesión individual por trabajador (usuario y contraseña).
- Gestión de trabajadores por parte del administrador.
- Gestión de sucursales o negocios, con conteos separados por ubicación.

### 3.3 Actualización en tiempo real

Cuando un trabajador modifica una cantidad, el cambio se refleja automáticamente en los demás dispositivos conectados a la misma sucursal.

### 3.4 Auditoría completa

Cada modificación queda registrada con usuario, sucursal, valor modificado, cantidad anterior, cantidad nueva, fecha y hora, permitiendo revisar el historial de cambios y detectar inconsistencias.

### 3.5 Panel de administrador

El administrador podrá gestionar usuarios, sucursales, valores de conteo, inventario actual, historial de auditoría y el módulo de análisis descrito a continuación.

### 3.6 Módulo de análisis de inventario (nueva funcionalidad)

Se incorpora una tabla/panel de análisis con información relevante para entender el estado del inventario contado, útil tanto para consulta directa como para representarse en gráficas. La información relevante a mostrar incluye:

- **Cantidad de existencias por categoría de valor**: cuántas unidades se han contado para cada valor definido.
- **Categoría de valor con mayor cantidad de existencias**: el valor con más unidades contadas (el más "rotado" o abundante).
- **Categoría de valor con menor cantidad de existencias**: útil para detectar posible desabastecimiento.
- **Subtotal monetario por categoría de valor**: cantidad × valor, para saber cuánto representa cada categoría dentro del inventario total.
- **Participación porcentual de cada categoría**: qué porcentaje del inventario total (en unidades y en valor monetario) representa cada categoría.
- **Total general del inventario**: unidades totales contadas y valor monetario total.
- **Comparativo por sucursal**: mismas métricas anteriores, pero desglosadas por sucursal, para comparar el desempeño entre ubicaciones.
- **Última actualización por categoría**: fecha/hora del último conteo registrado para esa categoría, útil para saber qué tan reciente es la información mostrada.

Esta información es la base para construir gráficas como: gráfico de barras (unidades por categoría de valor), gráfico de pastel (participación porcentual por valor o por sucursal), y tablas comparativas entre sucursales. La generación visual de estas gráficas puede evaluarse como una mejora posterior; en esta fase se define la estructura de datos necesaria para soportarlas.

---

## 4. Tecnologías seleccionadas

## 4.1 Flutter

Flutter será el framework principal para desarrollar la aplicación móvil.

### ¿Por qué usar Flutter?

Flutter permite construir una única base de código que corre tanto en Android como en iOS, con un rendimiento cercano al nativo y una experiencia visual fluida. Para un proyecto donde varios trabajadores usarán la aplicación desde distintos dispositivos móviles, esto reduce el tiempo de desarrollo y evita mantener dos aplicaciones separadas.

### Beneficios para este proyecto

- Una sola base de código para Android e iOS.
- Rendimiento fluido, ideal para actualizaciones en tiempo real en pantalla.
- Amplio ecosistema de paquetes para autenticación, bases de datos en tiempo real y gráficas.
- Curva de aprendizaje razonable para un proyecto de alcance sencillo.
- Buena documentación y comunidad activa.

### Uso dentro del sistema

Flutter se usará para construir:

- Las pantallas de inicio de sesión.
- Las pantallas de conteo por valor.
- El panel administrativo (usuarios, sucursales, valores).
- El módulo de historial de auditoría.
- El módulo de análisis de inventario.

---

## 4.2 Dart

Dart es el lenguaje nativo de Flutter y se usará para toda la lógica de la aplicación.

### ¿Por qué usar Dart?

Al ser el lenguaje propio de Flutter, garantiza total compatibilidad con el framework, buen rendimiento y tipado fuerte, lo cual ayuda a reducir errores al manejar cantidades, valores monetarios y cálculos de subtotales.

### Beneficios para este proyecto

- Tipado fuerte, útil para evitar errores en cálculos de cantidades y valores.
- Compilación a código nativo (AOT), lo que mejora el rendimiento en dispositivos móviles.
- Integración total con el ecosistema Flutter.

### Uso dentro del sistema

Dart se usará para definir modelos de datos (usuario, sucursal, valor de conteo, registro de auditoría), la lógica de negocio y las validaciones de la aplicación.

---

## 4.3 Riverpod (gestión de estado)

Riverpod se usará como solución de gestión de estado dentro de la aplicación.

### ¿Por qué usar Riverpod?

El sistema necesita reflejar cambios en tiempo real en la pantalla de conteo cuando otro trabajador modifica una cantidad. Riverpod permite manejar este tipo de estado reactivo de forma clara, además de facilitar la separación entre la lógica de negocio y la interfaz visual, lo cual encaja con la arquitectura por capas definida para el proyecto.

### Beneficios para este proyecto

- Manejo claro del estado reactivo (ideal para tiempo real).
- Facilita separar la lógica de negocio de la interfaz.
- Buen soporte para pruebas.
- Encaja naturalmente con una organización por capas.

### Uso dentro del sistema

Riverpod se usará para manejar el estado de: sesión del usuario, conteo actual de la sucursal seleccionada, datos del módulo de análisis y notificaciones de cambios en tiempo real.

---

## 4.4 Firebase (Authentication + Cloud Firestore)

Firebase se usará como backend principal del sistema.

### ¿Por qué usar Firebase?

El proyecto requiere autenticación de usuarios, almacenamiento de datos y, sobre todo, **sincronización en tiempo real** entre varios dispositivos conectados. Firebase ofrece estas tres necesidades de forma integrada, sin requerir construir un backend propio desde cero, lo cual es adecuado para un proyecto de alcance sencillo con un tiempo de desarrollo corto.

### Beneficios para este proyecto

- Cloud Firestore sincroniza los cambios en tiempo real de forma nativa (ideal para el requisito de actualización instantánea entre dispositivos).
- Firebase Authentication resuelve el inicio de sesión de trabajadores de forma segura.
- Reduce la necesidad de mantener un servidor propio.
- Buena integración con Flutter mediante paquetes oficiales.
- Escalable si el número de sucursales o trabajadores crece.

### Uso dentro del sistema

Firebase se usará para:

- Autenticar a los trabajadores y al administrador.
- Almacenar sucursales, valores de conteo y cantidades contadas.
- Sincronizar en tiempo real los cambios entre dispositivos conectados a la misma sucursal.
- Almacenar el historial de auditoría (usuario, sucursal, valor, cantidad anterior, cantidad nueva, fecha y hora).
- Alimentar el módulo de análisis de inventario con los datos agregados por categoría.

---

## 4.5 fl_chart

fl_chart se usará como librería de gráficas dentro de la aplicación.

### ¿Por qué usar fl_chart?

Es una librería nativa de Flutter, ligera y ampliamente usada, que permite construir gráficos de barras y de pastel a partir de los datos calculados en el módulo de análisis (existencias por categoría, participación porcentual, comparativo por sucursal), sin depender de vistas web ni de librerías externas pesadas.

### Beneficios para este proyecto

- Integración nativa con Flutter (sin WebView).
- Buen rendimiento en dispositivos móviles.
- Soporta gráficos de barras y de pastel, adecuados para las métricas definidas en el módulo de análisis.
- Personalizable a los colores e identidad visual de la aplicación.

### Uso dentro del sistema

fl_chart se usará para representar visualmente los datos del módulo de análisis: unidades por categoría de valor, participación porcentual por categoría y comparativos entre sucursales.

---

## 5. Arquitectura del sistema

### 5.1 Arquitectura seleccionada: arquitectura por capas

Dado que **conteoDeProductosEficiente** es un proyecto sencillo, con un alcance funcional acotado (conteo, auditoría, gestión básica y análisis), se selecciona una **arquitectura por capas** dentro de una única aplicación Flutter.

Las capas definidas son:

- **Capa de presentación (UI):** pantallas, widgets y navegación construidos en Flutter.
- **Capa de lógica de negocio / estado:** manejada con Riverpod, contiene las reglas de cálculo de subtotales, validaciones de cantidades y lógica de agregación para el módulo de análisis.
- **Capa de datos (repositorios):** encapsula el acceso a Firebase (Authentication y Firestore), de forma que la lógica de negocio no dependa directamente del proveedor de backend.
- **Capa de modelos:** define las entidades del sistema (usuario, sucursal, valor de conteo, registro de auditoría, resumen de análisis).

### 5.2 ¿Por qué no una arquitectura Clean Architecture completa?

Clean Architecture con separación estricta en múltiples módulos (dominio, casos de uso, infraestructura completamente desacoplada, etc.) aporta beneficios en proyectos grandes con muchos desarrolladores y reglas de negocio complejas. Para un proyecto del tamaño de conteoDeProductosEficiente, esa separación adicional agregaría complejidad y tiempo de desarrollo sin un beneficio real, ya que el número de reglas de negocio y de integraciones externas es reducido.

### 5.3 ¿Por qué no microservicios ni backend propio?

El proyecto no requiere un backend independiente con múltiples servicios desplegados por separado. Firebase ya resuelve autenticación, almacenamiento y sincronización en tiempo real. Construir un backend propio (por ejemplo, con Node.js o Spring Boot) y una arquitectura de microservicios agregaría infraestructura, costo y tiempo de desarrollo innecesarios para el alcance actual.

### 5.4 Decisión final de arquitectura

- **Tipo de aplicación:** aplicación móvil multiplataforma (Android e iOS).
- **Framework principal:** Flutter.
- **Lenguaje:** Dart.
- **Modelo arquitectónico:** aplicación única organizada por capas (presentación, lógica de negocio/estado, datos, modelos).
- **Gestión de estado:** Riverpod.
- **Backend:** Firebase (Authentication + Cloud Firestore).
- **Visualización de datos:** fl_chart.

Esta decisión equilibra simplicidad, velocidad de desarrollo y capacidad de sincronización en tiempo real, que es uno de los requisitos centrales del sistema.

---

## 6. Estructura tecnológica recomendada

- Aplicación móvil: Flutter.
- Lenguaje: Dart.
- Arquitectura: por capas (presentación, lógica de negocio, datos, modelos).
- Gestión de estado: Riverpod.
- Autenticación: Firebase Authentication.
- Base de datos y sincronización en tiempo real: Cloud Firestore.
- Visualización de datos: fl_chart.
- Distribución: Google Play Store y, opcionalmente, App Store.

---

## 7. Despliegue recomendado

### Opción recomendada: Firebase + tiendas de aplicaciones

Firebase se encargará del backend (autenticación, datos y sincronización en tiempo real), mientras que la aplicación se distribuirá a los trabajadores mediante Google Play Store (y opcionalmente App Store si se requiere soporte para iOS).

### ¿Por qué esta opción?

- No requiere administrar servidores propios.
- Firebase escala automáticamente según el uso.
- Facilita actualizaciones futuras de la aplicación sin afectar el backend.
- Es una opción de bajo costo para un proyecto de este alcance.

---

## 8. Flujo general del conteo

1. El trabajador inicia sesión con su usuario y contraseña.
2. Selecciona la sucursal donde va a realizar el conteo.
3. Abre la pantalla de conteo, donde ve los valores definidos (bajos y altos, bajo la misma estructura).
4. Registra la cantidad contada para cada valor.
5. El sistema calcula el subtotal de cada valor y el total general.
6. Si otro trabajador está conectado a la misma sucursal, ve los cambios reflejados de inmediato.
7. Cada modificación queda registrada automáticamente en el historial de auditoría.
8. El administrador puede consultar el inventario actual, el historial de cambios y el módulo de análisis en cualquier momento.

---

## 9. Módulos definidos para el sistema

### 9.1 Módulo de autenticación

Gestiona el inicio de sesión de trabajadores y administrador.

### 9.2 Módulo de gestión de usuarios

Permite al administrador crear y administrar trabajadores.

### 9.3 Módulo de gestión de sucursales

Permite manejar varias sucursales o negocios, cada una con su propio conteo.

### 9.4 Módulo de conteo por valor

Permite registrar cantidades para cualquier valor definido, bajo una misma estructura de conteo.

### 9.5 Módulo de sincronización en tiempo real

Refleja automáticamente los cambios entre los dispositivos conectados a una misma sucursal.

### 9.6 Módulo de auditoría

Registra usuario, sucursal, valor modificado, cantidad anterior, cantidad nueva, fecha y hora de cada cambio.

### 9.7 Módulo de análisis de inventario

Calcula y muestra existencias por categoría de valor, categoría con mayor y menor cantidad, subtotales monetarios, participación porcentual, comparativo por sucursal y datos listos para representarse en gráficas.

### 9.8 Panel administrativo

Centraliza la gestión de usuarios, sucursales, valores de conteo, auditoría y análisis.

---

## 10. Tecnologías descartadas en esta fase

### Aplicación web (en lugar de móvil)

No se selecciona como tecnología principal porque el conteo se realiza físicamente en las sucursales, donde una aplicación móvil ofrece mejor usabilidad que una página web adaptada.

### React Native

Aunque también permite desarrollo multiplataforma, se descarta frente a Flutter porque el proyecto ya define Flutter como tecnología principal, y Flutter ofrece un rendimiento más consistente en ambas plataformas con una sola base de código.

### Backend propio (Node.js, Spring Boot, etc.)

No se recomienda para esta fase porque Firebase ya cubre las necesidades de autenticación, almacenamiento y sincronización en tiempo real, sin requerir infraestructura ni mantenimiento adicional.

### Microservicios

Se descartan porque el alcance del proyecto no incluye múltiples módulos independientes ni necesidades de escalabilidad compleja que los justifiquen.

### Clean Architecture completa (múltiples módulos desacoplados)

No se recomienda para esta fase por la simplicidad del proyecto. Una arquitectura por capas dentro de una sola aplicación es suficiente y evita complejidad innecesaria.

### Base de datos SQL local únicamente (sin sincronización en la nube)

Se descarta como única fuente de datos porque no cumpliría con el requisito central de actualización en tiempo real entre varios dispositivos.

---

## 11. Justificación final de la elección tecnológica

La combinación de Flutter, Dart, Riverpod, Firebase (Authentication y Cloud Firestore) y fl_chart es adecuada porque permite construir una aplicación móvil multiplataforma, con sincronización en tiempo real, auditoría completa y un módulo de análisis de datos, sin necesidad de desarrollar ni mantener un backend propio.

Para conteoDeProductosEficiente, esta combinación cubre el alcance definido —conteo unificado por valor, gestión de usuarios y sucursales, tiempo real, auditoría y análisis— manteniendo un tiempo de desarrollo corto y una arquitectura organizada por capas, acorde a un proyecto de tamaño sencillo.

---

## 12. Resultado esperado de esta fase

Al finalizar la fase de exploración, se define que el proyecto será desarrollado como una **aplicación móvil en Flutter**, con backend en Firebase para autenticación y sincronización en tiempo real, organizada internamente mediante una **arquitectura por capas**, e incluirá un módulo de análisis de inventario que permitirá visualizar existencias por categoría de valor, identificar las categorías con mayor o menor cantidad de productos, y comparar el desempeño entre sucursales, sentando las bases para futuras representaciones gráficas del inventario.
