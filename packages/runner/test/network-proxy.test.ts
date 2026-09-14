import net from "node:net";
import { describe, expect, test } from "vitest";
import { parseProxyConfiguration, proxyVersion, startProxy } from "../../../images/network-proxy/proxy.mjs";

describe("single-destination network proxy", () => {
  test("accepts exactly one plain host and TCP port without exposing it in metadata", () => {
    const configuration = parseProxyConfiguration({
      AIBENCH_PROXY_DESTINATION_HOST: "192.168.1.50",
      AIBENCH_PROXY_DESTINATION_PORT: "1234",
    });

    expect(configuration).toEqual({ host: "192.168.1.50", port: 1234 });
    expect(proxyVersion).toMatch(/^1\.0\.0$/);
  });

  test("rejects a URL, missing port or additional destination configuration", () => {
    expect(() => parseProxyConfiguration({ AIBENCH_PROXY_DESTINATION_HOST: "http://192.168.1.50", AIBENCH_PROXY_DESTINATION_PORT: "1234" })).toThrow(/host/i);
    expect(() => parseProxyConfiguration({ AIBENCH_PROXY_DESTINATION_HOST: "192.168.1.50" })).toThrow(/port/i);
    expect(() => parseProxyConfiguration({ AIBENCH_PROXY_DESTINATION_HOST: "192.168.1.50", AIBENCH_PROXY_DESTINATION_PORT: "1234", AIBENCH_PROXY_DESTINATION_HOST_2: "192.168.1.51" })).toThrow(/single/i);
  });

  test("forwards TCP bytes to its single configured destination", async () => {
    const destination = net.createServer((socket) => socket.on("data", (data) => socket.write(data)));
    await new Promise<void>((resolve) => destination.listen(0, "127.0.0.1", resolve));
    const destinationAddress = destination.address();
    if (!destinationAddress || typeof destinationAddress === "string") throw new Error("destination did not bind a TCP port");
    const proxy = await startProxy({ host: "127.0.0.1", port: destinationAddress.port }, { listenHost: "127.0.0.1", listenPort: 0 });
    const proxyAddress = proxy.address();
    if (!proxyAddress || typeof proxyAddress === "string") throw new Error("proxy did not bind a TCP port");

    const received = await new Promise<string>((resolve, reject) => {
      const client = net.createConnection({ host: "127.0.0.1", port: proxyAddress.port }, () => client.write("ping"));
      client.once("data", (data) => { client.end(); resolve(data.toString()); });
      client.once("error", reject);
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => destination.close((error) => error ? reject(error) : resolve())),
    ]);
    expect(received).toBe("ping");
  });
});
