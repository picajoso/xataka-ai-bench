export type SecretMatch = { byteStart: number; byteEnd: number };

export function findBearerSecrets(text: string): SecretMatch[] {
  return [...text.matchAll(/\bBearer\s+[^\s]+/gi)].map((match) => ({
    byteStart: Buffer.byteLength(text.slice(0, match.index)),
    byteEnd: Buffer.byteLength(text.slice(0, (match.index ?? 0) + match[0].length)),
  }));
}

export function findApiKeys(text: string): SecretMatch[] {
  return [...text.matchAll(/\bsk-[A-Za-z0-9_-]{8,}\b/g)].map((match) => ({
    byteStart: Buffer.byteLength(text.slice(0, match.index)),
    byteEnd: Buffer.byteLength(text.slice(0, (match.index ?? 0) + match[0].length)),
  }));
}
