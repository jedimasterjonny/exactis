import type { BinaryLike, ScryptOptions } from "node:crypto";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// A stored password is `scrypt:N=131072,r=8,p=1:salt:key`, the salt and
// the key in hex, the key being scrypt of the password under that salt
// at that cost and this length. The app holds the hash and never the
// password, so a copy of its environment does not give the password
// away. The head says what the hash was made with, so one made at
// another cost, as every hash was before this one, is told apart from
// it rather than compared and missed.
const keyLength = 64;

const saltLength = 16;

const made = "scrypt:N=131072,r=8,p=1";

const stored = /^scrypt:N=131072,r=8,p=1:([\da-f]{32}):([\da-f]{128})$/;

// The cost the head names, N, r and p in Node's longer names, at
// OWASP's floor for scrypt. It needs a little over 128 MiB a derivation,
// and Node allows 32 unless told otherwise.
const cost: ScryptOptions = {
  blockSize: 8,
  cost: 2 ** 17,
  maxmem: 256 * 2 ** 20,
  parallelization: 1,
};

// Off the event loop, since a derivation at this cost takes a good part
// of a second.
const derive = promisify<BinaryLike, BinaryLike, number, ScryptOptions, Buffer>(
  scrypt,
);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltLength);
  const key = await derive(password, salt, keyLength, cost);
  return `${made}:${salt.toString("hex")}:${key.toString("hex")}`;
}

// True when the password is the one the hash was made from. Space at
// either end of the hash is not part of it, as the line break the script
// prints after it, which a pasted or piped value can keep. A hash that
// is not the shape above, one made at another cost or with a part that
// is not hex among them, is a misconfiguration rather than a wrong
// password, so it fails loudly rather than refusing everyone quietly.
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const [, salt, key] = stored.exec(hash.trim()) ?? [];
  if (salt === undefined || key === undefined) {
    throw new Error(
      "The password hash is not one bun run hash-password writes. Make it again with that.",
    );
  }
  return timingSafeEqual(
    await derive(password, Buffer.from(salt, "hex"), keyLength, cost),
    Buffer.from(key, "hex"),
  );
}
