import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Owner } from "@/data/owners";
import type { Answer } from "@/lib/answer";

import { saveQualifyingYears } from "@/actions/owners";
import { Toaster } from "@/components/kit/toast";
import { owners, sam } from "@/data/owners.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";

import { StatePension } from "./state-pension";

vi.mock("@/actions/owners", () => ({ saveQualifyingYears: vi.fn() }));

// The owners fixture's one, born in 1990, with thirty qualifying years
// typed, and Sam, born in 1993, with none. A save reports through the
// toast manager, which needs its Toaster mounted.
const me = { ...owners[0], qualifyingYears: 30 };

function renderTab(): void {
  render(<StatePension owners={[me, sam]} />, { wrapper: Toaster });
}

describe("StatePension", () => {
  // Both reach 68, in 2058 and 2061, and thirty years earn £10,755 a
  // year; Sam earns nothing on none.
  it("lists each owner with the State Pension age their year of birth gives, the years typed and what they earn", () => {
    renderTab();

    expect(screen.getByText("Sect. VI.v")).toHaveClass("label");
    expect(
      screen.getByRole("region", { name: "State pension" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("row").map((row) => row.textContent),
    ).toStrictEqual([
      "OwnerQualifying yearsA year",
      "MeBorn 1990 · State Pension age 68£10,755 from 2058",
      "SamBorn 1993 · State Pension age 68None",
    ]);
    expect(field("Qualifying years for Me")).toHaveValue("30");
    expect(field("Qualifying years for Sam")).toHaveValue("0");
  });

  // Thirty-five years earn the full £12,548 a year. The stored years
  // come back with the page rather than with the answer, so once the
  // store has answered the row shows the years it was given again.
  it("saves an owner's years alone as the focus leaves them, what they earn following at once", async () => {
    const answer = Promise.withResolvers<Answer<Owner>>();
    vi.mocked(saveQualifyingYears).mockReturnValue(answer.promise);
    renderTab();

    commit(field("Qualifying years for Sam"), "35");

    expect(
      await screen.findByRole("cell", { name: "£12,548 from 2061" }),
    ).toBeInTheDocument();
    expect(field("Qualifying years for Sam")).toHaveValue("35");
    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(sam.id, 35);

    answer.resolve(saved({ ...sam, qualifyingYears: 35 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Qualifying years saved" }),
      ).toHaveAccessibleDescription("Sam · £12,548 from 2061");
    });
    await waitFor(() => {
      expect(field("Qualifying years for Sam")).toHaveValue("0");
    });
  });

  it("sends nothing for years typed back to what they were, or nothing typed for an owner with none", () => {
    renderTab();

    commit(field("Qualifying years for Me"), "30");
    commit(field("Qualifying years for Sam"), "0");

    expect(saveQualifyingYears).not.toHaveBeenCalled();
  });

  it("holds the years to fifty at most", async () => {
    vi.mocked(saveQualifyingYears).mockResolvedValue(
      saved({ ...me, qualifyingYears: 50 }),
    );
    renderTab();

    commit(field("Qualifying years for Me"), "80");

    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(me.id, 50);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Qualifying years saved" }),
      ).toHaveAccessibleDescription("Me · £12,548 from 2058");
    });
  });

  it("puts the years back and says why when the store refuses them", async () => {
    vi.mocked(saveQualifyingYears).mockResolvedValue(
      refused("No owner has the id"),
    );
    renderTab();

    commit(field("Qualifying years for Me"), "9");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Qualifying years not saved" }),
      ).toHaveAccessibleDescription("No owner has the id");
    });
    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(me.id, 9);
    await waitFor(() => {
      expect(field("Qualifying years for Me")).toHaveValue("30");
    });
  });
});
