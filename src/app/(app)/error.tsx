"use client";

import type { ErrorInfo } from "next/error";
import type { JSX } from "react";

import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { Button } from "@/components/kit/button";
import { reasonOf } from "@/lib/errors";

// What a signed-in screen shows in its place when drawing it throws, as
// the engine does over a plan it refuses: the frame stays, since the
// boundary sits beneath the layout, so the other screens are a click
// away, and the screen says it could not be drawn and why, with a way
// to draw it again once whatever was wrong has been put right.
export default function ScreenError({
  error,
  retry,
}: Readonly<ErrorInfo>): JSX.Element {
  return (
    <ScreenBody>
      <EmptyState
        description={reasonFor(error)}
        icon={TriangleAlert}
        title="This screen could not be drawn"
      >
        <Button
          onClick={() => {
            retry();
          }}
          size="sm"
          variant="outline"
        >
          Try again
        </Button>
      </EmptyState>
    </ScreenBody>
  );
}

// Why the screen could not be drawn. An error thrown in the browser, as
// the engine's is, carries its own words, read as a refusal's are. One
// thrown on the server reaches a production browser with its words
// withheld, as React's minified error 441, and a digest in their place,
// which the server's log prints beside the words, so the screen gives
// the digest to find them by rather than React's error. In development
// the words come through, so they are read as the engine's are.
function reasonFor(error: unknown): string {
  return process.env.NODE_ENV === "production" &&
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
    ? `The server could not draw it. Its log gives the reason under ${error.digest}.`
    : reasonOf(error);
}
