import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Cma } from "@/data/cma";
import type { Answer } from "@/lib/answer";

import { pullCma } from "@/actions/cma";
import { Toaster } from "@/components/kit/toast";
import { cma } from "@/data/cma.fixture";
import { refused, saved } from "@/lib/answer";

import { CmaPull } from "./cma-pull";

vi.mock("@/actions/cma", () => ({ pullCma: vi.fn() }));

describe("CmaPull", () => {
  it("pulls BlackRock's workbook, holding while it is on its way, and says what it pulled", async () => {
    const answer = Promise.withResolvers<Answer<Cma>>();
    vi.mocked(pullCma).mockReturnValue(answer.promise);
    render(<CmaPull />, { wrapper: Toaster });
    const pull = screen.getByRole("button", { name: "Pull CMA workbook" });

    fireEvent.click(pull);

    await waitFor(() => {
      expect(pull).toHaveAttribute("aria-busy", "true");
    });

    answer.resolve(saved(cma));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA pulled" }),
      ).toHaveAccessibleDescription("August 2026, data as of 30 Jun 2026");
    });
    await waitFor(() => {
      expect(pull).not.toHaveAttribute("aria-busy");
    });
  });

  it("says why when the pull is refused", async () => {
    vi.mocked(pullCma).mockResolvedValue(
      refused("BlackRock did not send its capital market assumptions"),
    );
    render(<CmaPull />, { wrapper: Toaster });

    fireEvent.click(screen.getByRole("button", { name: "Pull CMA workbook" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA not pulled" }),
      ).toHaveAccessibleDescription(
        "BlackRock did not send its capital market assumptions",
      );
    });
  });
});
