# Storage baseline

Observed on 2026-09-11 for the Xataka AI Bench control host.

## Active volume

| Property | Observed value |
| --- | --- |
| Benchmark root | `/Volumes/MacOS_VMs/xataka-ai-bench` |
| Mount point | `/Volumes/MacOS_VMs` |
| Device | `/dev/disk6s1` |
| Location and protocol | External, USB |
| File system | APFS |
| Capacity | 1.8 TB |
| Free space at verification | 1.71 TB |
| Writable | Yes |
| File ownership | Disabled |
| Encryption | No |
| Docker engine | Available |

The automated preflight resolved the physical path, created and removed a write probe, and confirmed that the benchmark root is on the expected APFS mount. It must run before benchmark execution; failure must stop the run rather than falling back to the Mac mini's internal disk.

## Current safeguards

- `platform/` is the only Git repository and contains public-source candidates only.
- `state/` and `legacy/` are siblings of the repository and cannot be staged accidentally from it.
- The preflight requires at least 10 GiB free by default.
- The legacy copy procedure is additive: it refuses an existing destination, compares sorted SHA-256 inventories, and never removes the original tree.

## Security decision before real runs

The volume is not encrypted and file ownership is disabled. Until that changes or the owner explicitly accepts the risk, real runs must use only public or synthetic inputs and must not retain logs known to contain credentials, personal data, unpublished documents, private repository contents, or private service URLs.

Model credentials remain outside the project and are referenced only by environment-variable name. Public result packages will still pass through the separate sanitization and human-review stage defined in the architecture.

Before enabling untrusted execution, the runner plan must also validate whether disabled ownership weakens the chosen container and workspace isolation on this volume.
