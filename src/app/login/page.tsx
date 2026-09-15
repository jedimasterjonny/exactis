import type { JSX } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { LoginForm } from "./login-form";

// The screen the app sends anyone to who is not signed in, and the only
// one that asks nothing of the session. One card, centred on a bare page:
// the screen sits outside the frame, since a sidebar is no use to someone
// who cannot yet go anywhere.
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
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
