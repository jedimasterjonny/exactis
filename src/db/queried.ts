import * as z from "zod";

// What a failed query keeps: the statement, its values left as
// placeholders, the driver's code, its words with anything shaped as a
// URL taken out, and the code of the network failure beneath them where
// there is one, an address not found or a connection timed out. The rest
// is dropped, since a failure is written to the server's log: Drizzle's
// error carries the values bound to the statement, which may be the
// whole household, a scenario's name, or raw file bytes, the driver's
// error what it was parsing when it failed, and the driver's words quote
// a connection string it cannot read whole, password and all.
const failure = z.object({
  cause: z.object({
    code: z.string().optional(),
    message: z.string().transform((words) =>
      words
        .split(/(\s+)/u)
        .map((word) => (word.includes("://") ? "[a URL]" : word))
        .join(""),
    ),
    sourceError: z
      .object({ cause: z.object({ code: z.string() }) })
      .optional()
      .catch(undefined),
  }),
  query: z.string(),
});

// A query run, and when it fails, failed again with only what a failure
// keeps, or, for a failure in no shape a query's takes, with only that.
export async function queried<TResult>(
  query: PromiseLike<TResult>,
): Promise<TResult> {
  try {
    return await query;
  } catch (error) {
    const kept = failure.safeParse(error);
    throw kept.success
      ? new Error(`Failed query: ${kept.data.query}`, {
          cause: kept.data.cause,
        })
      : new Error("Failed query, in no shape a query's failure takes");
  }
}
