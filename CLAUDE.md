# Xataka AI Bench — contexto operativo

## Propósito

Xataka AI Bench es un banco reproducible, auditable y ampliable para comparar sistemas agentes de IA mediante tareas prácticas. La unidad de comparación es el sistema completo: agente, modelo, backend, hardware, versiones, parámetros, permisos, red y fecha; no el modelo aislado.

El proyecto es personal de Javipas y puede alimentar artículos puntuales de Xataka. Su centro de control es un Mac mini. Los primeros agentes son OpenCode y Codex; Claude Code y Antigravity/Gemini son ampliaciones futuras.

Muchas pruebas son expositivas: se publica el resultado para que el lector lo valore. No se debe inventar una nota numérica ni un ranking global. Las métricas objetivas, cuando existan, se muestran como hechos verificables. En el futuro se podría añadir una capa separada de votaciones de lectores, nunca como sustituto de la metodología técnica.

## Rutas y almacenamiento

El repositorio público vive en:

```text
/Volumes/MacOS_VMs/xataka-ai-bench/platform
```

El estado privado, fuera de Git, vive en:

```text
/Volumes/MacOS_VMs/xataka-ai-bench/state
```

El SSD externo es obligatorio. Configurar siempre:

```bash
export AIBENCH_HOME=/Volumes/MacOS_VMs/xataka-ai-bench
```

No usar el disco interno como alternativa silenciosa. El SSD es APFS pero actualmente no está cifrado: no copiar secretos, configuraciones que los contengan ni transcripciones crudas al repositorio o al propio SSD sin una decisión explícita del usuario.

La fuente legacy original sigue en `/Users/javipas/qwen-vs-codex-tests`. Es solo lectura: no copiarla, moverla, archivarla ni modificarla sin autorización expresa.

## Decisiones de producto ya aprobadas

- GitHub será la fuente pública de verdad; Vercel Hobby, el escaparate inicial.
- El portal es bilingüe, español e inglés, y estático. No usar Sites hosting: el usuario eligió explícitamente Vercel.
- No hay cuentas, comentarios, votos ni ranking global en la primera versión.
- La publicación requiere aprobación humana explícita. Publicar resúmenes, evidencias seleccionadas y código autorizado; no logs crudos por defecto.
- Las demos interactivas futuras irán aisladas mediante iframe restringido o dominio separado.
- Una reparación oficial es un segundo intento inmutable: prompt original + diagnósticos objetivos + instrucción neutral. Nunca usar sugerencias editoriales humanas en una ejecución oficial.
- Política de red predeterminada aprobada: bloqueada salvo registros de paquetes y endpoint local declarado por la prueba.
- Las diez pruebas originales son material de partida, no una suite fija. Deben poder añadirse, versionarse o retirarse.

## Perfiles históricos conocidos

- `oxalpha`: GLM-5.3, llamado “ox alpha” durante su etapa stealth; OpenCode, acceso temporal gratuito.
- `qwen`: Qwen3.8-27B, razonamiento máximo, NVFP4, servido por LM Studio desde el PC con RTX 5090.
- `qwen2`: Qwen3.8-27B, reasoning desactivado, nInfer.
- `qwen3-medium`: Qwen3.8-27B, razonamiento medio, nInfer.
- `codex`: GPT-5.6-Sol mediante `codex-agentrouter`/AgentRouter.

No inspeccionar ni registrar el alias `codex-agentrouter`, sus claves o configuraciones de secretos.

## Arquitectura del repositorio

```text
apps/cli/                 CLI de control manual
apps/web/                 portal Next.js con exportación estática para Vercel
packages/contracts/       esquemas, hashes y manifiestos
packages/config/          catálogo y rutas de almacenamiento
packages/adapters/        adaptadores Fake, Codex y OpenCode
packages/runner/          planes, runs, aislamiento y máquina de estados
packages/evaluation/      validadores, navegador, reparación y legacy
packages/publisher/       scanner, candidato, aprobación y staging
benchmarks/               definiciones públicas versionadas
systems/                  perfiles públicos de sistemas
published/                futuro contenido público preparado
images/agent-runner/      imagen Docker de ejecución
legacy-migration/         mapeo e instrucciones de inventario legacy
docs/superpowers/         diseño y planes históricos aprobados
```

El diseño fuente está en `docs/superpowers/specs/2026-09-11-xataka-ai-bench-design.md`. Los planes existentes describen foundation, runner, evaluación/legacy y portal/publicación.

## Estado implementado

### Fundamentos y ejecución

- Contratos estrictos para benchmarks, perfiles, planes, runs, evaluación y publicación.
- Primera prueba formal: `benchmarks/space-station-fps`, de tipo exhibitive y con captura de escritorio.
- Perfiles públicos de los sistemas históricos anteriores.
- Planificación persistente y runs inmutables con estados, eventos JSONL y hashes.
- Adaptadores Fake, Codex y OpenCode. El modo real está bloqueado expresamente hasta configurar un perfil privado válido: jamás puede caer en el runner fake.
- Aislamiento Docker oficial; preflight de adaptadores dentro del contenedor. Solo se pasan los nombres de variables autorizadas, no sus valores en argumentos ni logs.
- Imagen local construida: `aibench/agent-runner:opencode-1.18.30`.
- La ejecución real aún no está conectada a la CLI: falta una configuración privada y segura del endpoint/credenciales.

### Evaluación y legacy

- Validadores de archivos, comandos, JSON, rutas prohibidas y captura Playwright reproducible.
- Reparación inmutable preparada, pero todavía no expuesta como comando CLI.
- Inventario legacy de solo lectura; mapeo de variantes históricas y candidatos `legacy-unverified` en memoria. No hay importación/copia legacy real todavía.

### Publicación y portal

- Scanner que bloquea `.env`, claves API/Bearer y llaves SSH; redacta rutas locales. Nunca incorpora valores sensibles al informe.
- Empaquetado por lista blanca con hash determinista.
- Aprobación ligada al hash: no se puede reutilizar si el paquete cambia.
- Staging atómico bajo `published/runs/<runId>`, sin Git push ni Vercel. Exige y escribe un `publication.json` validado.
- Contrato privado de candidatura en `state/review/candidates/<candidateId>/`, con `candidate.json`, paquete permitido y aprobación inmutable separada. Hay una plantilla segura en `examples/review-candidate.example.json` y documentación en `docs/private-review-candidates.md`; no contienen secretos ni rutas personales.
- La CLI ya revisa candidaturas privadas y solo crea una aprobación al invocar explícitamente `aibench review <candidateId> --approve --reviewer <nombre>`. `aibench publish <candidateId> --stage-only` vuelve a comprobar el hash y únicamente entonces hace staging local; sigue sin hacer commit, push o despliegue.
- Ensayo sintético automatizado: candidato → scanner → hash → aprobación → staging → manifiesto público. No usa modelos ni servicios externos.
- `apps/web` usa Next.js con `output: 'export'`. Tiene portada, metodología, pruebas, sistemas y comparación en `/es` y `/en`. Lee solo `published/`; nunca `state/`. Todavía no hay resultados públicos reales, así que no existe una página dinámica de run: Next no permite exportar esa ruta si el catálogo está vacío. Activarla cuando se stagee el primer resultado.

## Mandamientos de seguridad y cambios

1. Usar `apply_patch` para editar archivos.
2. Antes de tocar código, escribir/ejecutar una prueba que falle cuando sea razonable. Ejecutar `pnpm check` antes de afirmar que algo funciona.
3. No ejecutar modelos, no usar credenciales, no desplegar, no hacer push y no publicar resultados sin autorización explícita.
4. No añadir secretos, rutas locales, logs crudos, cachés, workspaces ni artefactos generados a Git. `.next/` y `apps/web/out/` están ignorados.
5. No usar comandos destructivos (`git reset --hard`, borrados recursivos, checkout de usuario) sin autorización explícita.
6. Mantener cambios pequeños, verificados y con commits temáticos. El árbol puede tener cambios del usuario: preservarlos.
7. En cada prueba pública, conservar el prompt canónico exacto. La traducción al inglés es informativa; ejecutarla sería otra versión.

## Comandos útiles

Desde la raíz del repositorio, con Node 22:

```bash
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm check
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm --filter @aibench/web build
```

Los tests Docker reales solo se ejecutan con `AIBENCH_DOCKER_TESTS=1` y una imagen explícita. Docker debe estar disponible por `/usr/local/bin/docker` en este Mac.

## Próximos pasos recomendados

1. Conectar un perfil privado de OpenCode de forma segura para una primera ejecución real pequeña y autorizada.
2. Exponer reparación y evaluación desde la CLI.
3. Stagear un resultado sintético o real aprobado, habilitar la página de detalle de run y comprobar el portal con datos reales.
4. Añadir GitHub Actions y preview de Vercel. No configurar credenciales ni desplegar sin autorización explícita.
5. Importar/copiado legacy únicamente cuando el usuario lo autorice expresamente.

## Evolución reciente

Los commits más recientes construyen, en este orden, el scanner, empaquetado/aprobación, staging, catálogo portal, portada/bilingüismo, rutas de comparación, manifiestos de publicación y ensayo sintético. Consultar `git log --oneline` para el historial exacto.
