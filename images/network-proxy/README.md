# Proxy de red por ejecución

Esta imagen implementa un forward TCP de un único destino privado. Se inicia
con los nombres de variables `AIBENCH_PROXY_DESTINATION_HOST` y
`AIBENCH_PROXY_DESTINATION_PORT`; los valores se inyectan por el runtime y no
deben aparecer en comandos, logs ni Git.

Construcción local, tras verificar el código:

```sh
docker build --tag aibench/network-proxy:1.0.0 images/network-proxy
```

El proceso solo comunica su versión y estado de escucha. Nunca registra el
host o puerto de destino.
