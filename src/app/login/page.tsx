import type { JSX } from "react";

import { Button } from "@/components/kit/button";
import { Card, CardContent, CardHeader } from "@/components/kit/card";
import { isDevSignInOpen } from "@/lib/dev-sign-in";

import { signInAsDeveloper } from "./actions";
import { LoginForm } from "./login-form";

// The screen the app sends anyone to who is not signed in, and the only
// one that asks nothing of the session. One card, centred on a bare page:
// the screen sits outside the frame, since a sidebar is no use to someone
// who cannot yet go anywhere. In development, with the door open, a
// second form beneath the first signs in with no password asked, so an
// agent that types no credentials can still reach the app.
export default function Login(): JSX.Element {
  return (
    <div className="grid min-h-svh place-items-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span className="label text-muted-foreground">Exactis</span>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Sign in
          </h1>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LoginForm />
          {isDevSignInOpen() && (
            <form
              action={signInAsDeveloper}
              className="grid gap-2 border-t pt-4"
            >
              <Button
                className="justify-self-start"
                size="sm"
                type="submit"
                variant="outline"
              >
                Sign in without a password
              </Button>
              <p className="text-xs text-muted-foreground">
                Open because APP_DEV_SIGN_IN is set. Never in production.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
