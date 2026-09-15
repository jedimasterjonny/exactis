import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// A stored password is `salt:key`, both hex, the key being scrypt of the
// password under that salt at this length. The app holds the hash and
// never the password, so a copy of its environment does not give the
// password away.
const keyLength = 64;

const saltLength = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(saltLength);
  return `${salt.toString("hex")}:${derive(password, salt).toString("hex")}`;
}

// True when the password is the one the hash was made from. A hash that
// is not the shape above is a misconfiguration, not a wrong password, so
// it fails loudly rather than refusing everyone quietly.
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, key] = hash.split(":");
  const expected = key === undefined ? undefined : Buffer.from(key, "hex");
  if (salt === undefined || expected?.length !== keyLength) {
    throw new Error(
      "The password hash is not salt:key as bun run hash-password writes it",
    );
  }
  return timingSafeEqual(derive(password, Buffer.from(salt, "hex")), expected);
}

function derive(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, keyLength);
}
