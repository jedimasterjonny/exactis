// How long a source has to send its file, which is a few hundred KB
// and arrives in a second or two.
const patience = 30_000;

// The most of a file read from a source, in bytes: thirty times the
// 350 KB the largest of them sends, and far short of filling the memory
// a server has to read it in.
const limit = 10_000_000;

// The file at the address, fresh rather than any copy a cache holds, or
// why it did not come, saying who was asked for what: the status they
// answered with instead, its body let go unread rather than holding the
// connection open, or that nothing came in time. A source answers at
// the address it is asked at, every one of them with its file and none
// with a redirect, so a redirect is followed nowhere, and is said as
// the status it answered with. A request given in place of an address is
// sent as it is, for a source that answers a question posted to it
// rather than serving a file, and what it answers with is the file.
// The file is read as it comes rather than held whole first, and one
// running past the limit is let go there and refused.
export async function download(
  address: Request | string,
  who: string,
  what: string,
): Promise<string | Uint8Array> {
  try {
    const response = await fetch(address, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(patience),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return `${who} answered ${String(response.status)} rather than sending ${what}`;
    }
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > limit) {
        return `${who} sent more than 10 MB, far past the size of ${what}`;
      }
      chunks.push(chunk);
    }
    return await new Blob(chunks).bytes();
  } catch {
    return `${who} did not send ${what}`;
  }
}
