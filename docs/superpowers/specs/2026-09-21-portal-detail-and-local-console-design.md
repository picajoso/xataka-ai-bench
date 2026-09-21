# Portal de resultados y consola local — Diseño

**Estado:** propuesto para planificación  
**Fecha:** 2026-09-21

## Propósito

Completar el primer recorrido público de Xataka AI Bench para que una persona pueda llegar desde una prueba o un sistema a una ejecución concreta, entender qué ocurrió y abrir únicamente los materiales aprobados. Añadir una superficie distinta, privada y local, para operar el banco desde el Mac mini sin exponer `state/`, credenciales, endpoints o expedientes brutos.

## Decisiones aprobadas

- El portal público sigue siendo estático, bilingüe y desplegado en Vercel.
- La consola de operador solo escucha en `localhost` del Mac mini. No se despliega, no se incluye en `published/` y no comparte rutas ni build con el portal público.
- GitHub continúa siendo la fuente pública de verdad; Vercel muestra builds explícitamente promovidos.
- No hay votos, cuentas, comentarios ni ranking global. Las páginas muestran cobertura, estado y hechos verificables.
- Todo material visible procede de `published/`. El portal nunca lee `state/`.

## Entrega A: portal público de resultados

### Rutas

Las rutas llevan prefijo de locale y se exportan estáticamente:

- `/es/tests/:benchmark` y `/en/tests/:benchmark`: ficha de prueba y resultados disponibles.
- `/es/systems/:system` y `/en/systems/:system`: ficha pública del sistema y ejecuciones publicadas.
- `/es/runs/:run` y `/en/runs/:run`: ficha inmutable de una ejecución publicada.

La portada, las listas y la matriz enlazan siempre a estas rutas. La raíz pública redirige a `/es`.

### Ficha de ejecución

Una ficha muestra solo datos del manifiesto público y archivos incluidos:

- identificador, fecha de publicación y carácter oficial;
- prueba, sistema y estado editorial (incluido fallo, incompleto o error de infraestructura);
- resumen localizado, sin traducir ni resumir de nuevo el prompt canónico;
- hechos objetivos y fases first-shot/reparación cuando se hayan declarado públicos;
- enlaces a código, evidencias y demo aprobados.

Un resultado exhibitivo fallido no recibe nota ni se oculta: explica la condición verificable que impidió su funcionamiento. Si no existe demo segura, se muestra el código o evidencia disponible, nunca un iframe vacío.

Las demos estáticas aprobadas se cargan en `iframe sandbox` sin `allow-same-origin`, formularios, ventanas emergentes ni permisos. Los resultados que no tengan una demo aprobada no generan iframe.

### Navegación y presentación

La prueba es la superficie primaria de comparación: enumera sistemas y sus estados sin declarar vencedor. La ficha de sistema agrupa sus resultados. La matriz conserva cobertura y disponibilidad; no sintetiza una puntuación.

La accesibilidad se valida mediante orden de encabezados, enlaces con texto, foco visible y navegación por teclado. Las dos traducciones son contenido de interfaz; el prompt original conserva su idioma canónico y la traducción, cuando exista, se etiqueta como informativa.

## Entrega B: automatización de despliegue

El workflow de GitHub ejecuta instalación bloqueada, tests y export estático. La publicación de resultados sigue requiriendo revisión y aprobación humana.

Vercel puede conectarse después a GitHub para generar previews de cambios. Una promoción a producción siempre es una acción explícita: no se implementa una promoción automática desde el runner ni desde material de un benchmark.

La configuración de Vercel permanece en el repositorio, fija Node 22, exporta `apps/web/out` y mantiene rutas limpias. `.vercel/` y todos los `.env*` permanecen ignorados.

## Entrega C: consola privada del operador

La consola se ejecuta en el Mac mini y consume un API local mínimo que delega en la CLI existente. No monta `state/` en el portal ni ofrece API pública.

Las primeras vistas son:

- estado del almacenamiento, Docker y perfiles disponibles (`doctor` y catálogo);
- creación explícita de plan y ejecución; los botones muestran primero la matriz y exigen confirmación;
- lista de ejecuciones locales con estado, enlace al expediente local y acciones permitidas (reparar solo si aplica);
- cola de candidaturas privadas y acción de revisión/preparación, nunca aprobación o publicación automática.

La consola no representa secretos, variables de entorno, URLs privadas, logs brutos ni transcripciones. Para ejecutar, hereda el entorno del proceso local y muestra únicamente nombres de variables requeridas. Solo enlaza rutas que se resuelvan dentro de `AIBENCH_HOME`.

La primera implementación no añade autenticación porque el servidor queda ligado a `127.0.0.1`. Si en el futuro se abre a LAN, requerirá un diseño nuevo de autenticación y autorización.

## Límites de seguridad

- Una ficha pública nunca puede derivar rutas desde texto libre: resuelve exclusivamente `includedPaths` del manifiesto validado y comprueba que cada ruta permanezca dentro del directorio publicado de su `runId`.
- La consola trata los archivos de `state/` como datos no confiables y muestra campos saneados; no ejecuta comandos contenidos en logs o manifiestos.
- La API local solo acepta identificadores validados contra el catálogo o el almacén de runs; no acepta rutas arbitrarias ni argumentos de shell.
- La integración GitHub/Vercel no recibe credenciales de modelos, perfiles privados ni estado local.

## Orden de implementación

1. Completar la navegación y las fichas estáticas públicas, con pruebas de datos y export.
2. Añadir una prueba de despliegue/mock de preview y documentar la conexión GitHub→Vercel sin promoción automática.
3. Construir la consola local como aplicación independiente, con API local y pruebas de rutas, confirmaciones y filtrado de secretos.
4. Ejecutar un segundo resultado oficial solo cuando la presentación pública permita inspeccionarlo de principio a fin.

## Criterios de aceptación

1. Un visitante puede navegar desde `/es/tests` a una ficha de prueba, sistema y ejecución publicada sin recibir 404.
2. La ficha del primer resultado deja claro que fue un fallo validado y ofrece los archivos aprobados, sin exponer estado privado.
3. El portal exporta las rutas ES/EN, pasa `pnpm check` y Vercel las sirve con rutas limpias.
4. La consola funciona solo en `127.0.0.1`, no forma parte del build de Vercel y no permite inyectar comandos ni rutas.
5. Una publicación sigue necesitando aprobación humana y una promoción de Vercel sigue necesitando acción explícita.
