import { open, readFile, unlink } from "node:fs/promises";

type LockRecord = {
  pid: number;
  createdAt: string;
};

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function acquire(lockPath: string): Promise<void> {
  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() } satisfies LockRecord));
      await handle.sync();
    } finally {
      await handle.close();
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  let existing: LockRecord | undefined;
  try {
    existing = JSON.parse(await readFile(lockPath, "utf8")) as LockRecord;
  } catch {
    throw new Error(`Global run lock is unavailable: ${lockPath}`);
  }
  if (typeof existing.pid === "number" && !processIsAlive(existing.pid)) {
    await unlink(lockPath);
    return acquire(lockPath);
  }
  throw new Error(`Global run lock is held: ${lockPath}`);
}

export async function withGlobalRunLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  await acquire(lockPath);
  try {
    return await operation();
  } finally {
    await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
