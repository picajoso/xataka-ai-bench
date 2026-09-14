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

Una política `package-registries` no puede salir directamente a npm desde la red interna: requiere que se declare un mirror o registry privado como destino permitido (por ejemplo, Verdaccio en la LAN).

La política `local-endpoint` permite exactamente un endpoint privado, normalmente
el de inferencia, sin prometer acceso a registros de paquetes. Es la adecuada
para pruebas autocontenidas como `space-station-fps` 1.1.0.

## Configuración privada

Copiar `examples/execution-profiles.example.yaml` a
`/Volumes/MacOS_VMs/xataka-ai-bench/state/execution-profiles.yaml`. El archivo
privado puede contener un host LAN y puerto, pero nunca una URL completa, una
clave API ni valores de variables de entorno. Las claves se siguen inyectando
desde el entorno del proceso por nombre.

Para OpenCode, copiar también `examples/opencode-provider.example.json` a la
ruta privada indicada por `opencodeConfigPath`. El archivo se monta de solo
lectura como `/aibench/opencode.json`; debe referenciar `inference.local:8080`
y una variable de entorno, no la dirección LAN ni un valor de clave. El runner
inyecta `OPENCODE_CONFIG` dentro del contenedor para que OpenCode use esa copia
privada.

Los perfiles públicos pueden declarar directorios temporales efímeros. El perfil
OpenCode + nInfer de Qwen habilita únicamente `/tmp`: el runner lo monta como
`tmpfs` privado del contenedor y la configuración privada autoriza solo
`/tmp/*` como `external_directory`. No equivale a conceder acceso a un
directorio temporal del host ni a activar la aprobación automática de OpenCode.

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
