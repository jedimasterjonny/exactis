// How long a source has to send its file, which is a few hundred KB
// and arrives in a second or two.
const patience = 30_000;

// The file at the address, fresh rather than any copy a cache holds, or
// why it did not come, saying who was asked for what: the status they
// answered with instead, its body let go unread rather than holding the
// connection open, or that nothing came in time. A request given in
// place of an address is sent as it is, for a source that answers a
// question posted to it rather than serving a file, and what it answers
// with is the file.
export async function download(
  address: Request | string,
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
