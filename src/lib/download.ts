// How long a source has to send its file, which is a few hundred KB
// and arrives in a second or two.
const patience = 30_000;

// The file at the address, fresh rather than any copy a cache holds, or
// why it did not come, saying who was asked for what: the status they
// answered with instead, its body let go unread rather than holding the
// connection open, or that nothing came in time.
export async function download(
  address: string,
  who: string,
  what: string,
): Promise<string | Uint8Array> {
  try {
    const response = await fetch(address, {
      cache: "no-store",
      signal: AbortSignal.timeout(patience),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return `${who} answered ${String(response.status)} rather than sending ${what}`;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return `${who} did not send ${what}`;
  }
}
