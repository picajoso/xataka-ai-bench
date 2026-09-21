import { startConsole } from "./server.js";

const server = await startConsole();
const address = server.address();
if (address === null || typeof address === "string") throw new Error("Console did not bind a TCP loopback address");
process.stdout.write(`Xataka AI Bench local console: http://127.0.0.1:${address.port}\n`);
