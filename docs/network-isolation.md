# Aislamiento de red de ejecuciones oficiales

Los runs comparables de Xataka AI Bench se ejecutan en Docker con clase
`official-container`. Los agentes no usan la red bridge general de Docker.

Cuando un benchmark necesita conectividad, el runner crea por run una red
interna efímera y uno o más proxies TCP de destino único. El agente solo está
conectado a la red interna y ve aliases sintéticos como `inference.local`. Cada
proxy también está conectado a la salida Docker y reenvía exclusivamente al
host y puerto privados configurados para ese alias. Todos los proxies y la red
interna se eliminan al finalizar el run. La política `blocked` mantiene
`--network none` y no crea esos recursos.

## Configuración privada

Copiar `examples/execution-profiles.example.yaml` a
`/Volumes/MacOS_VMs/xataka-ai-bench/state/execution-profiles.yaml`. El archivo
privado puede contener un host LAN y puerto, pero nunca una URL completa, una
clave API ni valores de variables de entorno. Las claves se siguen inyectando
desde el entorno del proceso por nombre.

Cada endpoint usa un alias terminado en `.local`. Ese alias es el único
destino que recibe el agente; el host y puerto reales se suministran al
sidecar mediante su entorno de proceso y no aparecen en argumentos Docker,
eventos JSONL, manifiestos públicos ni Git.

## Evidencia de cada run

Antes de lanzar el adaptador, el contenedor comprueba que los aliases
permitidos respondan a través del proxy y que `aibench-control.invalid` no
pueda conectarse. El evento de diagnóstico resultante incluye solamente la
versión del proxy y un hash SHA-256 de la allow-list. Si falla cualquiera de
las comprobaciones, el run termina como `INFRA_ERROR`.

## Límite de seguridad conocido

En Docker Desktop para macOS este diseño evita salidas accidentales por nombre
de host y mantiene al agente fuera de la red de salida, pero no pretende ser
un cortafuegos absoluto contra un agente que intente IPs crudas de la LAN. Una
garantía fuerte futura requeriría ejecutar Docker dentro de una VM Linux con
reglas de egress por run controladas por `iptables`.
