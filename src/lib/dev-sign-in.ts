// The door for development: a sign-in that asks no password, open only
// when the environment says so and never in a production build, so the
// variable is inert on Vercel even if someone sets it there. Read where
// it is asked rather than on import, as every variable here is.
export function isDevSignInOpen(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env["APP_DEV_SIGN_IN"] === "1"
  );
}
