# Xataka AI Bench

Banco de pruebas reproducible para comparar sistemas completos de IA: agente, modelo, backend, configuración y entorno. No construye un ranking global artificial; cada prueba conserva su propio contexto y criterios.

## Portal público

El portal estático se publica desde `published/` y no lee `state/`, perfiles privados, credenciales, logs brutos ni workspaces. Las rutas públicas están disponibles en español e inglés:

- `/es/tests/:benchmark` y `/en/tests/:benchmark` para cada prueba.
- `/es/systems/:system` y `/en/systems/:system` para cada sistema.
- `/es/runs/:run` y `/en/runs/:run` para cada resultado aprobado.

Una ejecución fallida publicada también es un resultado válido: explica la condición comprobable del fallo y solo enlaza materiales aprobados. Las demos estáticas se muestran en un `iframe` aislado; si no hay demo aprobada, no se inventa una.

## Verificación local

```sh
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm check
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm --filter @aibench/web build
scripts/verify-public-export.sh
```

GitHub Actions ejecuta estas comprobaciones sobre cambios en `main`. Vercel puede crear previews, pero una promoción a producción sigue siendo una acción explícita y revisada; ningún runner publica o promociona resultados automáticamente.
