# Xataka AI Bench — Diseño del sistema

**Estado:** aprobado para planificación; todavía no implementado

**Fecha:** 2026-09-11

**Nombre:** “Xataka AI Bench” es provisional y el proyecto es personal.

## 1. Propósito

Construir un banco personal, auditable y ampliable para comparar sistemas agentes de IA completos mediante tareas prácticas. La unidad comparada no es el modelo aislado, sino la combinación versionada de modelo, agente, backend, hardware, software, parámetros, permisos y fecha.

El banco debe permitir iniciar manualmente una tanda desde el Mac mini, ejecutar pruebas en entornos aislados, conservar el expediente íntegro, aplicar validaciones objetivas cuando existan y publicar resultados aprobados en GitHub y Vercel. Muchas pruebas serán expositivas: el lector juzgará la aplicación, juego, documento o informe sin una puntuación artificial.

## 2. Alcance inicial

- Centro de control: Mac mini.
- Agentes iniciales: Codex CLI y OpenCode.
- Backends: servicios cloud y servidores locales accesibles desde el PC de la red.
- Stack de la plataforma: TypeScript estricto sobre Node.js 22 y pnpm.
- Persistencia: manifiestos YAML/JSON, eventos JSONL y directorios inmutables; sin base de datos.
- Publicación: repositorio público en GitHub y portal bilingüe desplegado inicialmente en Vercel Hobby.
- Interfaz operativa inicial: CLI invocada manualmente o mediante un proyecto local de Codex.
- Portal: lectura, exploración y comparación; sin cuentas, votos, comentarios ni ranking global.

Quedan fuera del primer alcance la ejecución remota, la programación periódica, la votación pública, el ranking agregado, Claude Code, Antigravity, la aplicación de escritorio de Antigravity y una base de datos central.

## 3. Principios metodológicos

1. Una ejecución compara un sistema completo y versionado.
2. El prompt canónico de una versión es idéntico entre sistemas. Las instrucciones operativas específicas del agente se separan y publican.
3. Cada resultado es inmutable. Una repetición crea otro `run_id`.
4. Las ejecuciones oficiales son autónomas, secuenciales y aisladas.
5. El `first-shot` dispone de 30 minutos por defecto. La reparación dispone de 15 minutos y trabaja sobre el resultado anterior.
6. La reparación recibe el prompt original, errores objetivos y una instrucción neutral de revisión. Las pistas humanas producen una ejecución asistida, excluida de la comparación oficial.
7. Un fallo del sistema evaluado cuenta como resultado. Una incidencia previa o ajena al sistema se marca `INFRA_ERROR` y permite repetir.
8. La navegación y las APIs externas están bloqueadas por defecto. Se permiten registros de paquetes y el endpoint local autorizado. Toda excepción pertenece a la versión de la prueba.
9. Solo se publican automáticamente materiales declarados públicos y redistribuibles.
10. No se asigna una puntuación numérica cuando la prueba no la justifica.

## 4. Catálogo abierto de pruebas

Las diez pruebas existentes son material de partida, no una suite permanente. El catálogo permite añadir, retirar y versionar pruebas sin modificar el corredor. Retirar una prueba impide nuevas ejecuciones oficiales, pero conserva sus definiciones y resultados históricos.

Cada prueba autocontenida incluye:

- `benchmark.yaml`: identidad, versión, estado, categoría, límites, red, entradas, validadores, captura y publicación.
- `prompt.es.md`: prompt canónico inicial.
- `prompt.en.md`: traducción informativa; ejecutarla crea una versión distinta.
- `fixtures/`: materiales iniciales públicos y sus hashes.
- `validators/`: comprobaciones específicas opcionales.
- `capture/`: receta visual opcional, centrada inicialmente en escritorio.
- `README.es.md` y `README.en.md`: explicación editorial y criterios observables.

Tipos de evaluación:

- `verifiable`: predominan comprobaciones objetivas.
- `mixed`: combina hechos verificables y juicio editorial.
- `exhibitive`: publica el resultado y evidencias sin nota obligatoria.

## 5. Perfil de sistema

Un perfil público identifica modelo, agente, proveedor, backend, hardware, sistema operativo, versiones, parámetros de inferencia, cuantización, reasoning, permisos y política de herramientas. Las URLs privadas se sustituyen por descripciones seguras; las credenciales se referencian mediante nombres de variables externas.

Los perfiles legacy conocidos son:

- Codex CLI + GPT-5.6-Sol mediante AgentRouter.
- OpenCode + GLM-5.3 stealth gratuito.
- OpenCode + Qwen3.8-27B NVFP4 mediante LM Studio, razonamiento máximo.
- OpenCode + Qwen3.8-27B mediante ninfer, razonamiento desactivado.
- OpenCode + Qwen3.8-27B mediante ninfer, razonamiento medio.

Una modificación que pueda afectar al resultado crea una nueva versión del perfil.

## 6. Arquitectura física

```text
/Volumes/MacOS_VMs/xataka-ai-bench/
├── platform/                 # único repositorio público
│   ├── apps/cli/
│   ├── apps/web/
│   ├── packages/contracts/
│   ├── packages/runner/
│   ├── packages/adapters/
│   ├── packages/evaluation/
│   ├── packages/publisher/
│   ├── benchmarks/
│   ├── systems/
│   ├── published/
│   └── docs/
├── state/                    # nunca pertenece a Git
│   ├── config/
│   ├── runs/
│   ├── workspaces/
│   ├── cache/
│   └── review/
└── legacy/
    └── qwen-vs-codex-tests/
```

El código del corredor puede ser público. Secretos, configuración privada, logs brutos, sesiones, cachés y workspaces permanecen fuera del repositorio.

## 7. Componentes

### Contratos

Define y valida `BenchmarkDefinition`, `SystemProfile`, `BatchPlan`, `RunManifest`, `RunEvent`, `EvaluationReport` y `PublicationManifest`. Calcula hashes estables de prompts, fixtures y perfiles.

### CLI

Expone inicialmente `doctor`, `list`, `plan`, `run`, `repair`, `status`, `review`, `publish` e `import-legacy`. `plan` siempre muestra la matriz y costes/límites conocidos antes de iniciar trabajo real.

### Corredor

Gestiona estados `PENDING`, `PREFLIGHT`, `RUNNING`, `VALIDATING`, `READY_FOR_REVIEW`, `PUBLISHED`, `FAILED`, `TIMEOUT`, `PARTIAL`, `REJECTED_FOR_PUBLICATION` e `INFRA_ERROR`. Usa un bloqueo global para impedir ejecuciones oficiales simultáneas.

### Adaptadores

Un contrato común encapsula preflight, construcción del comando, consumo de eventos, cancelación y metadatos. La primera versión incluye un adaptador falso determinista, Codex `exec --json` y OpenCode `run --format json`.

### Aislamiento

El modo oficial usa contenedores desechables mediante una interfaz compatible con Docker. Las credenciales se montan con el mínimo acceso y nunca se copian al resultado. Una prueba incompatible puede ejecutarse en modo nativo etiquetado como experimental.

### Evaluación y captura

Ejecuta validadores comunes y específicos, conserva salidas, inspecciona aplicaciones web y captura escritorio cuando la prueba lo declare. Los errores de compilación, tests y consola alimentan la reparación neutral.

### Publicador

Genera un paquete candidato, elimina rutas y secretos, valida licencias declaradas, produce un informe de saneamiento y requiere aprobación humana. La publicación genera un commit revisable; un fallo de GitHub o Vercel no cambia el resultado del benchmark.

### Portal

Interfaz bilingüe con portada editorial, catálogo de pruebas, páginas comparativas por prueba, fichas de sistemas, matriz completa, metodología y detalle de ejecución. El prompt original siempre se muestra; su traducción se etiqueta como informativa.

## 8. Almacenamiento y seguridad

Todo vive en el SSD externo APFS montado en `/Volumes/MacOS_VMs`. Antes de cada ejecución, `doctor` comprueba montaje, escritura, espacio, rendimiento mínimo, propiedad de archivos y disponibilidad del motor de contenedores. Nunca se usa silenciosamente el disco interno como alternativa.

El volumen actual no está cifrado y tiene la propiedad de archivos desactivada. La preparación debe validar ambos aspectos antes de ejecutar material no confiable o almacenar logs con información sensible.

El expediente local conserva eventos, stdout/stderr, transcripción, archivos iniciales y finales, hashes, métricas, capturas y evaluación. La publicación inicial incluye únicamente un resumen técnico saneado, código autorizado, evidencias seleccionadas y manifiesto público.

## 9. Migración legacy

La carpeta original `/Users/javipas/qwen-vs-codex-tests` ocupa aproximadamente 3,2 GB. Se copiará íntegra al SSD, se verificará mediante inventario y hashes y se conservará temporalmente el origen.

El importador excluirá del paquete público dependencias, builds, cachés, entornos virtuales, datos de IDE y metadatos Git internos. Reconstruirá resultados mediante código fuente, `RESULTS.md`, diferencias Git, capturas y metadatos disponibles. Los registros incompletos se etiquetarán `legacy-unverified`; no se inventarán tiempos, costes ni versiones.

La prueba 09 no contiene ejecuciones. La variante Qwen de la prueba 08 está vacía y la variante Codex de la prueba 10 solo conserva la referencia; ambas se representarán como ausentes o incompletas, no como fracasos oficiales.

## 10. Publicación y despliegue

GitHub es la fuente pública de verdad. Vercel es el escaparate inicial. Un único proyecto aloja el portal y resultados estáticos bajo rutas estables. Las aplicaciones dinámicas son excepciones explícitas y pueden obtener proyectos separados. El publicador se diseña detrás de una interfaz para permitir otro proveedor en el futuro.

Los resultados interactivos se ejecutan aislados del contexto principal mediante `iframe` restringido o dominio separado. Una aplicación que no pueda publicarse con seguridad se representa mediante código, capturas, vídeo y estado explicativo.

## 11. Verificación de la plataforma

- Tests de esquemas y hashes.
- Tests contractuales comunes para todos los adaptadores.
- Adaptador falso para probar sin consumir modelos.
- Tests de máquina de estados, bloqueos, cancelación y recuperación.
- Tests de aislamiento y política de red.
- Tests de saneamiento con secretos y rutas ficticias.
- Tests de inmutabilidad y generación del paquete público.
- Tests de compilación, navegación bilingüe, enlaces y demos del portal.
- Ensayo `dry-run` sin publicar.
- Ejecución real pequeña y autorizada antes de ampliar la suite.

## 12. Criterios de éxito de la primera versión

1. Una orden manual puede planificar y ejecutar secuencialmente una prueba con un perfil Codex u OpenCode.
2. El resultado inicial y la reparación quedan separados e inmutables.
3. El expediente completo se conserva en el SSD y el paquete público no contiene secretos conocidos.
4. Una prueba puede ser añadida o retirada sin cambiar el código del corredor.
5. Un resultado aprobado aparece en GitHub y en una preview de Vercel.
6. El portal bilingüe permite entender la prueba, comparar sistemas y abrir las evidencias o demo.
7. Los resultados legacy pueden importarse sin modificar ni borrar sus fuentes.
