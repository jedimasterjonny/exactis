"use client";

import type { JSX } from "react";

import { Field } from "@base-ui/react/field";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { signIn } from "./actions";

// The one field the app asks for. The form posts to the sign-in action
// and shows what it came back with, which is nothing on the way in and a
// reason on a miss; a hit navigates away. The password is the browser's
// to remember, so the field says what it is.
export function LoginForm(): JSX.Element {
  const [state, action, isPending] = useActionState(signIn, {});
  return (
    <form action={action} className="grid gap-4">
      <Field.Root
        className="grid content-start gap-1.5"
        invalid={state.error !== undefined}
      >
        <Field.Label className="label text-muted-foreground">
          Password
        </Field.Label>
        <Input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
        {state.error !== undefined && (
          <Field.Error className="text-xs text-destructive" match>
            {state.error}
          </Field.Error>
        )}
      </Field.Root>
      <Button
        className="justify-self-start"
        disabled={isPending}
        size="sm"
        type="submit"
      >
        Sign in
      </Button>
    </form>
  );
}
