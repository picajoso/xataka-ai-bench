FROM node:22-alpine

COPY proxy.mjs /usr/local/bin/aibench-network-proxy.mjs

USER node
EXPOSE 8080
ENTRYPOINT ["node", "/usr/local/bin/aibench-network-proxy.mjs"]
