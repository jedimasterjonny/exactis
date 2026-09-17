"use client";

import type { JSX } from "react";

import { useActionState } from "react";

import { Field } from "@/components/app/atoms/field";
import { Button } from "@/components/kit/button";
import { Input } from "@/components/kit/input";

import { signIn } from "./actions";

// The one field the app asks for. The form posts to the sign-in action
// and shows what it came back with, which is nothing on the way in and a
// reason on a miss; a hit navigates away. The password is the browser's
// to remember, so the field says what it is.
export function LoginForm(): JSX.Element {
  const [state, action, isPending] = useActionState(signIn, {});
  return (
    <form action={action} className="grid gap-4">
      <Field error={state.error} label="Password">
        <Input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </Field>
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
