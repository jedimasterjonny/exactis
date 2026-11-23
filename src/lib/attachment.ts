// A Content-Disposition attachment header naming a download, encoded as
// RFC 8187 specifies: encodeURIComponent plus [!'()*], since an
// apostrophe divides the value from its charset and the rest are not
// RFC 8187 attr-char tokens.
export function attachment(name: string): string {
  const encoded = encodeURIComponent(name).replaceAll(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}
