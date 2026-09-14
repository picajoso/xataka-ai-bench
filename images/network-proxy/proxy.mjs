/* global console, process */
import net from "node:net";
import { fileURLToPath } from "node:url";

export const proxyVersion = "1.0.1";

export function parseProxyConfiguration(environment) {
  const extraDestinationKeys = Object.keys(environment).filter((key) => key.startsWith("AIBENCH_PROXY_DESTINATION_") && ![
    "AIBENCH_PROXY_DESTINATION_HOST",
    "AIBENCH_PROXY_DESTINATION_PORT",
  ].includes(key));
  if (extraDestinationKeys.length > 0) throw new Error("Proxy accepts a single destination only");
  const host = environment.AIBENCH_PROXY_DESTINATION_HOST;
  const portText = environment.AIBENCH_PROXY_DESTINATION_PORT;
  if (typeof host !== "string" || !/^[A-Za-z0-9.-]+$/.test(host) || host.includes("..") || host.startsWith(".") || host.endsWith(".")) {
    throw new Error("Proxy destination host must be a plain hostname or IP address");
  }
  if (typeof portText !== "string" || !/^\d+$/.test(portText)) throw new Error("Proxy destination port is required");
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Proxy destination port is invalid");
  return { host, port };
}

export async function startProxy(configuration, options = {}) {
  const listenPort = options.listenPort ?? 8080;
  const listenHost = options.listenHost ?? "0.0.0.0";
  const server = net.createServer((incoming) => {
    const outgoing = net.createConnection({ host: configuration.host, port: configuration.port });
    let destinationConnected = false;
    let probeRequested = false;
    outgoing.once("connect", () => {
      destinationConnected = true;
      if (probeRequested) {
        incoming.end("AIBENCH-OK\n");
        outgoing.destroy();
      }
    });
    outgoing.once("error", () => incoming.destroy());
    incoming.once("error", () => outgoing.destroy());
    incoming.once("data", (firstChunk) => {
      if (firstChunk.toString() === "AIBENCH-PROBE\n") {
        probeRequested = true;
        if (destinationConnected) {
          incoming.end("AIBENCH-OK\n");
          outgoing.destroy();
        }
        return;
      }
      outgoing.write(firstChunk);
      incoming.pipe(outgoing);
      outgoing.pipe(incoming);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, resolve);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startProxy(parseProxyConfiguration(process.env));
  console.log(`aibench-network-proxy ${proxyVersion} listening`);
  const close = () => server.close(() => process.exit(0));
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
