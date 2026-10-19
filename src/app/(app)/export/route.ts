import { stamped } from "@/data/shapes";
import { today } from "@/lib/months";
import { readShown } from "@/store/household";

// The branch open handed out as a file to keep: the household, or the
// scenario open, as a save would write it, stamped with the shape it is
// kept in, so the app that reads it back carries it into its own. It is
// read as a page reads it, so the session is checked and a cookie naming
// a scenario dropped in another tab hands out the household, as the
// screen in this one shows it, rather than failing a download that has
// no way to say why. A latest version the rules refuse still fails it,
// but under the chain of shapes that is a bug rather than a state the
// store is left in. The file is named for the branch and the day, a
// scenario by its name as typed, encoded as RFC 8187 has it, the
// characters encodeURIComponent leaves alone escaped too, since an
// apostrophe is what divides the value from its charset; and it is never
// cached, since it is the whole household and changes with every save.
// Reading the cookie is what keeps it from being prerendered, so no
// segment config is needed.
export async function GET(): Promise<Response> {
  const { kept, scenario } = await readShown();
  const name = encodeURIComponent(
    `exactis-${scenario === "" ? "household" : scenario}-${today()}.json`,
  ).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return Response.json(stamped(kept), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
    },
  });
}
