// How long a source has to send its file, which is a few hundred KB
// and arrives in a second or two.
const defaultPatience = 30_000;

// The most of a file read from a source, in bytes: thirty times the
// 350 KB the largest of them sends, and far short of filling the memory
// a server has to read it in.
const defaultLimit = 10_000_000;

interface DownloadOptions {
  readonly limit?: number;
  readonly patience?: number;
  readonly signal?: AbortSignal;
  readonly what: string;
  readonly who: string;
}

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
  return downloadBounded(address, { what, who });
}

// Hardened fetch with caller-specified byte cap, per-request timeout,
// and optional outer abort signal (for batch time budgets).
export async function downloadBounded(
  address: Request | string,
  {
    limit = defaultLimit,
    patience = defaultPatience,
    signal,
    what,
    who,
  }: DownloadOptions,
): Promise<string | Uint8Array> {
  try {
    const timeout = AbortSignal.timeout(patience);
    const response = await fetch(address, {
      cache: "no-store",
      redirect: "manual",
      signal:
        signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
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
        return `${who} sent more than ${limitLabelOf(limit)}, far past the size of ${what}`;
      }
      chunks.push(chunk);
    }
    return await new Blob(chunks).bytes();
  } catch {
    return `${who} did not send ${what}`;
  }
}

function limitLabelOf(bytes: number): string {
  return bytes >= 1_000_000
    ? `${String(Math.round(bytes / 1_000_000))} MB`
    : `${String(Math.round(bytes / 1000))} KB`;
}
