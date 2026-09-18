// What a refusal is reported as, under the toast that says what was not
// done: the words the error carries, which are the action's own in
// development and Next's standing-in words in production, where a
// server error's message is masked before it reaches the browser; and a
// line of the app's own for a rejection that is no error at all, which
// nothing here throws but a promise may carry.
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
