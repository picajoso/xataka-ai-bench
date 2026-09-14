# Aislamiento de red oficial por ejecución

## Decisión

Las ejecuciones comparables de Xataka AI Bench usan exclusivamente `official-container` sobre Docker. La ejecución nativa, si se incorpora en el futuro, será `experimental-native`, se marcará de forma visible y nunca se comparará en la misma matriz que los resultados oficiales.

## Problema

La selección de una red Docker con nombre no limita por sí misma el tráfico saliente: una red bridge permite acceso NAT a la LAN e Internet. Por tanto, los nombres actuales `aibench-package-registry` y `aibench-package-registry-and-local` no constituyen una política de red aplicable. `blocked`, que usa `--network none`, sí mantiene su garantía actual.

## Arquitectura adoptada

Para cada run oficial que requiera salida se crean recursos efímeros y exclusivos:

```text
contenedor agente ── red interna efímera ── sidecar proxy ── red de salida ── endpoint privado permitido
```

El agente recibe un nombre de host sintético, no resoluble fuera de esa red, que se conecta al sidecar. El sidecar conoce el host y puerto reales del endpoint desde la configuración privada del run y reenvía únicamente TCP a ese destino. El perfil público conserva solo la descripción segura del backend; el endpoint, los valores de variables y las claves no entran en Git, eventos ni manifiestos públicos.

El agente solo se conecta a una red interna efímera creada por run. El sidecar es el único contenedor con dos interfaces: esa red interna y una red de salida de Docker. Así puede alcanzar el PC de inferencia, mientras que el agente no tiene ruta directa fuera de la red interna. Ambas conexiones del sidecar, el sidecar y la red interna se eliminan al terminar, incluso tras fallo o cancelación. Para `blocked` no se crea red ni sidecar y se conserva `--network none`.

La política `package-registries` usa un sidecar con una allow-list privada de registries. `package-registries-and-local-endpoint` añade un único destino local de inferencia. La primera implementación no declara una garantía de firewall contra conexiones de IP cruda desde Docker Desktop para macOS: reduce fugas accidentales, dificulta la salida no autorizada por hostname y deja ese límite documentado. Una garantía dura futura requerirá una VM Linux con reglas de egress controladas por run.

## Configuración privada

`state/execution-profiles.yaml` se amplía con referencias privadas de red: alias del endpoint, host y puerto, y las variables de entorno permitidas por nombre. Esos archivos pertenecen al SSD externo y se ignoran por Git. El contrato público de sistemas no guarda URL, IP, puerto, clave ni valor de configuración.

Cada run calcula un hash de una representación canónica de su allow-list. El hash y la versión de la imagen de proxy se escriben como diagnóstico del run; no se registra el destino real.

## Preflight medido

Antes de iniciar un agente, el runner ejecuta dentro del contenedor:

1. una comprobación TCP/HTTP mínima contra el alias permitido;
2. una resolución o conexión contra un hostname de control prohibido.

El primer control debe responder y el segundo debe fallar. Los resultados saneados se guardan como un evento de diagnóstico. Si cualquiera no cumple la política, el run pasa a `INFRA_ERROR`; el adaptador no se inicia.

## Límites y no objetivos

- No se ejecuta ningún modelo mientras se desarrolla esta infraestructura.
- No se incorporan secretos ni endpoints reales al repositorio.
- No se habilita el modo nativo como alternativa oficial.
- No se configura todavía una VM Linux, Colima o reglas `iptables`.
- No se despliega ni publica nada durante esta fase.

## Pruebas

Las pruebas unitarias comprobarán construcción de recursos, lifecycle de red, hash de allow-list, saneamiento de eventos y el rechazo de preflight. Las pruebas Docker de integración, activadas explícitamente, comprobarán que los recursos se eliminan tras run y que `blocked` nunca crea un sidecar.
