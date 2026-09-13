# Imagen de agente

La imagen oficial de Xataka AI Bench se construye con una versión explícita de
OpenCode. No se permite una versión implícita ni `latest`.

```sh
docker build \
  --build-arg OPENCODE_VERSION=<versión-verificada> \
  --tag aibench/agent-runner:<versión-verificada> \
  images/agent-runner
```

La construcción descarga el paquete oficial `opencode-ai`, verifica que el
binario `opencode` responde y después la imagen se ejecuta sin privilegios.
Las claves y la configuración privada no se incluyen en la imagen.
