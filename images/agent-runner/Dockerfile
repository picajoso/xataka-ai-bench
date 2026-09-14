FROM node:22-bookworm-slim

ARG OPENCODE_VERSION

RUN groupadd --gid 10001 aibench \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin aibench \
  && mkdir -p /workspace /output \
  && chown -R aibench:aibench /workspace /output \
  && apt-get update \
  && apt-get install --yes --no-install-recommends ripgrep \
  && rm -rf /var/lib/apt/lists/* \
  && test -n "$OPENCODE_VERSION" \
  && npm install --global "opencode-ai@$OPENCODE_VERSION" \
  && opencode --version

COPY --chmod=755 entrypoint.sh /usr/local/bin/aibench-entrypoint

USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/aibench-entrypoint"]
