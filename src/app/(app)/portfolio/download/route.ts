import { attachment } from "@/lib/attachment";
import { readStoredPortfolio } from "@/store/portfolio";

// Serves the household's latest stored binary .portfolio file
// byte-for-byte for desktop Portfolio Performance round-tripping.
// readStoredPortfolio checks the session (reading cookies, which keeps
// this route dynamic under cacheComponents) and reads the household's
// file even while a scenario is open. Never cached because replacing
// the file changes what this URL returns.
export async function GET(): Promise<Response> {
  const stored = await readStoredPortfolio();
  if (stored === null) {
    return new Response("No portfolio file stored", {
      headers: { "cache-control": "no-store" },
      status: 404,
    });
  }
  return new Response(stored.content, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": attachment(stored.fileName),
      "content-type": "application/octet-stream",
    },
  });
}
