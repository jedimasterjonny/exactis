import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScreenError from "./error";

function draw(error: unknown): void {
  render(
    <ScreenError
      error={error}
      reset={vi.fn<() => void>()}
      retry={vi.fn<() => void>()}
    />,
  );
}

// A server's error as React hands it to the browser: words, which
// production withholds, and the digest the server's log prints beside
// the words it did not send.
function fromServer(message: string): Error {
  return Object.assign(new Error(message), { digest: "3546086354" });
}

describe("ScreenError", () => {
  it("says the screen could not be drawn, in the words of an error the browser threw", () => {
    vi.stubEnv("NODE_ENV", "production");

    draw(new Error("A debt's payments end"));

    expect(
      screen.getByText("This screen could not be drawn"),
    ).toBeInTheDocument();
    expect(screen.getByText("A debt's payments end")).toBeInTheDocument();
  });

  it("gives the digest of a server's error in production, where its words are withheld", () => {
    vi.stubEnv("NODE_ENV", "production");

    draw(fromServer("Minified React error #441"));

    expect(
      screen.getByText(
        "The server could not draw it. Its log gives the reason under 3546086354.",
      ),
    ).toBeInTheDocument();
  });

  it("reads a server's error in its own words in development, where they come through", () => {
    vi.stubEnv("NODE_ENV", "development");

    draw(fromServer("Failed query: select from accounts"));

    expect(
      screen.getByText("Failed query: select from accounts"),
    ).toBeInTheDocument();
  });

  it("reads a digest that is no string as none, and stands in for a thrown value that is no error", () => {
    vi.stubEnv("NODE_ENV", "production");

    draw(Object.assign(new Error("A debt's payments end"), { digest: 7 }));
    draw("refused");

    expect(screen.getByText("A debt's payments end")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("draws the screen again when asked", () => {
    const reset = vi.fn<() => void>();
    const retry = vi.fn<() => void>();
    render(<ScreenError error={new Error("")} reset={reset} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });
});
