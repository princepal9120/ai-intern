/**
 * Cloudbox-style workspace snapshots. Stop archives /workspace into R2;
 * resume/fork restore it into a new sandbox. The bucket is optional: without
 * SNAPSHOTS, stop/resume/fork refuse rather than pretending they worked.
 */
import { boundTail, redactSecrets, shellJoin, shellQuote } from "./security.js";
import type { ExecResult } from "./runtime.js";

export const SNAPSHOT_PREFIX = "run-snapshots/";
export const MAX_SNAPSHOT_CHARS = 8_000_000;

export interface SnapshotFileOps {
  exec(
    command: string,
    opts?: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; signal?: AbortSignal },
  ): Promise<ExecResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(
    path: string,
    opts?: { maxBytes?: number; signal?: AbortSignal },
  ): Promise<{ kind: "utf8" | "base64"; content: string }>;
}

/** R2 `put`/`get` is enough; keep this narrow so Env.SNAPSHOTS assigns cleanly. */
export type SnapshotBucket = Pick<R2Bucket, "put" | "get">;

export function snapshotObjectKey(runId: string, at: number = Date.now()): string {
  const safe = runId.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 180);
  return `${SNAPSHOT_PREFIX}${safe}/${at}.b64`;
}

export function snapshotWorkdir(sandboxId: string): string {
  return `/workspace/${sandboxId}`;
}

export async function archiveWorkspace(ops: SnapshotFileOps, workdir: string, signal?: AbortSignal): Promise<string> {
  const archive = "/tmp/ai-intern-snap.tgz";
  const encoded = "/tmp/ai-intern-snap.b64";
  const packed = await ops.exec(
    shellJoin(["tar", "-C", workdir, "-czf", archive, "."]) +
      " && " +
      shellJoin(["base64", "-w", "0", archive]) +
      " > " +
      shellQuote(encoded),
    { timeoutMs: 5 * 60 * 1000, signal },
  );
  if (packed.exitCode !== 0) {
    throw new Error(`Snapshot archive failed: ${redactSecrets(boundTail(packed.stderr || packed.stdout, 500))}`);
  }
  const file = await ops.readFile(encoded, { maxBytes: MAX_SNAPSHOT_CHARS, signal });
  const body = file.content.replace(/\s+/g, "");
  if (!body) throw new Error("Snapshot archive was empty.");
  if (body.length > MAX_SNAPSHOT_CHARS) {
    throw new Error(`Snapshot exceeded ${MAX_SNAPSHOT_CHARS} characters; refuse to store it.`);
  }
  return body;
}

export async function restoreWorkspace(
  ops: SnapshotFileOps,
  workdir: string,
  base64: string,
  signal?: AbortSignal,
): Promise<void> {
  const encoded = "/tmp/ai-intern-snap.b64";
  const archive = "/tmp/ai-intern-snap.tgz";
  await ops.writeFile(encoded, base64);
  const restored = await ops.exec(
    `mkdir -p ${shellQuote(workdir)} && ` +
      shellJoin(["base64", "-d", encoded]) +
      ` > ${shellQuote(archive)} && ` +
      shellJoin(["tar", "-C", workdir, "-xzf", archive]),
    { timeoutMs: 5 * 60 * 1000, signal },
  );
  if (restored.exitCode !== 0) {
    throw new Error(`Snapshot restore failed: ${redactSecrets(boundTail(restored.stderr || restored.stdout, 500))}`);
  }
}

export async function putSnapshot(bucket: SnapshotBucket, key: string, body: string): Promise<void> {
  await bucket.put(key, body);
}

export async function getSnapshot(bucket: SnapshotBucket, key: string): Promise<string> {
  const object = await bucket.get(key);
  if (!object) throw new Error(`Snapshot ${key} was not found.`);
  const body = (await object.text()).replace(/\s+/g, "");
  if (!body) throw new Error(`Snapshot ${key} was empty.`);
  return body;
}

export function requireSnapshots<T>(bucket: T | undefined): T {
  if (!bucket) {
    throw new Error(
      "SNAPSHOTS R2 bucket is not bound. Add r2_buckets.SNAPSHOTS in wrangler.jsonc to stop/resume/fork runs.",
    );
  }
  return bucket;
}
