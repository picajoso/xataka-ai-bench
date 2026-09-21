# Xataka AI Bench

A reproducible test bench for comparing complete AI systems: agent, model, backend, configuration, and environment. It does not create an artificial global ranking; each test retains its own context and criteria.

## Public portal

The static portal is published only from `published/`. It never reads `state/`, private profiles, credentials, raw logs, or workspaces. Public routes are available in Spanish and English:

- `/es/tests/:benchmark` and `/en/tests/:benchmark` for each test.
- `/es/systems/:system` and `/en/systems/:system` for each system.
- `/es/runs/:run` and `/en/runs/:run` for each approved result.

A published failed run is also a valid result: it explains the verifiable failure condition and links only approved materials. Static demos render in a sandboxed `iframe`; where no approved demo exists, none is fabricated.

## Local verification

```sh
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm check
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm --filter @aibench/web build
scripts/verify-public-export.sh
```

GitHub Actions runs these checks for changes to `main`. Vercel may create previews, but production promotion remains an explicit reviewed action; no runner automatically publishes or promotes results.
