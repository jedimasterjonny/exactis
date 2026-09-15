import { stdin, stdout } from "node:process";
import { text } from "node:stream/consumers";

import { hashPassword } from "@/lib/password";

// Reads the password from standard input and writes the hash to set as
// APP_PASSWORD_HASH. Piped rather than prompted, so the password never
// shows on the terminal or lands in its history:
//
//   read -rs PASSWORD && printf %s "$PASSWORD" | bun run hash-password
//
// One trailing line break is dropped, so an echo without -n is not
// quietly hashed with a newline the sign-in form will never send.
const password = (await text(stdin)).replace(/\r?\n$/, "");
stdout.write(`${hashPassword(password)}\n`);
