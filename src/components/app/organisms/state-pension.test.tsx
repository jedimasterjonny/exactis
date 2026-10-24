import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Owner } from "@/data/owners";
import type { Answer } from "@/lib/answer";

import { saveQualifyingYears } from "@/actions/owners";
import { Toaster } from "@/components/kit/toast";
import { retiring } from "@/data/income.fixture";
import { retiringAt } from "@/data/milestones";
import { owners, sam } from "@/data/owners.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";

import { StatePension } from "./state-pension";

vi.mock("@/actions/owners", () => ({ saveQualifyingYears: vi.fn() }));

// The owners fixture's one, born in 1990 and retiring at 59 in 2049,
// with ten qualifying years typed through 2024/25, so 2025/26 to 2048/49
// count on to 34, and Sam, born in 1993, with none, on the plan whose
// owner retires at 59. A save reports through the toast manager, which
// needs its Toaster mounted.
const me = { ...owners[0], qualifiedThrough: 2024, qualifyingYears: 10 };

// The two figures of an owner's row, by the owner's name.
const years = (name: string): HTMLElement =>
  field(`Qualifying years for ${name}`);
const through = (name: string): HTMLElement =>
  field(`Tax year the qualifying years for ${name} run through`);

function renderTab(): void {
  render(<StatePension owners={[me, sam]} plan={retiring} />, {
    wrapper: Toaster,
  });
}

describe("StatePension", () => {
  // Both reach 68, in 2058 and 2061, and 34 years earn £12,189 a year;
  // Sam earns nothing on none.
  it("lists each owner with the State Pension age their year of birth gives, the years typed, the tax year they run through and what they earn", () => {
    renderTab();

    expect(screen.getByText("Sect. VI.v")).toHaveClass("label");
    expect(
      screen.getByRole("region", { name: "State pension" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("row").map((row) => row.textContent),
    ).toStrictEqual([
      "OwnerQualifying yearsThrough tax yearA year",
      "MeBorn 1990 · State Pension age 68£12,189 from 2058",
      "SamBorn 1993 · State Pension age 68None",
    ]);
    expect(years("Me")).toHaveValue("10");
    expect(through("Me")).toHaveValue("2024");
    expect(years("Sam")).toHaveValue("");
    expect(through("Sam")).toHaveValue("");
  });

  // Thirty-five years earn the full £12,548 a year. The stored record
  // comes back with the page rather than with the answer, so once the
  // store has answered the row shows the record it was given again.
  it("saves an owner's years as the focus leaves them, with no tax year, what they earn following at once", async () => {
    const answer = Promise.withResolvers<Answer<Owner>>();
    vi.mocked(saveQualifyingYears).mockReturnValue(answer.promise);
    renderTab();

    commit(years("Sam"), "35");

    expect(
      await screen.findByRole("cell", { name: "£12,548 from 2061" }),
    ).toBeInTheDocument();
    expect(years("Sam")).toHaveValue("35");
    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(
      sam.id,
      35,
      null,
    );

    answer.resolve(saved({ ...sam, qualifyingYears: 35 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "National Insurance record saved" }),
      ).toHaveAccessibleDescription("Sam · £12,548 from 2061");
    });
    await waitFor(() => {
      expect(years("Sam")).toHaveValue("");
    });
  });

  // Eleven years written under 2024/25 would count 2025/26 twice, so
  // the tax year goes with the change and is typed again for the new
  // record; until it is, the eleven are taken as they stand and earn
  // £3,944. The answer is given before the test ends, since React holds
  // every optimistic figure until the last save still waiting lands.
  it("clears the tax year at once when the years are typed afresh", async () => {
    const answer = Promise.withResolvers<Answer<Owner>>();
    vi.mocked(saveQualifyingYears).mockReturnValue(answer.promise);
    renderTab();

    commit(years("Me"), "11");

    expect(
      await screen.findByRole("cell", { name: "£3,944 from 2058" }),
    ).toBeInTheDocument();
    expect(through("Me")).toHaveValue("");
    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(
      me.id,
      11,
      null,
    );

    answer.resolve(saved({ ...me, qualifyingYears: 11 }));

    await waitFor(() => {
      expect(through("Me")).toHaveValue("2024");
    });
  });

  // Sam has none typed, which the field shows as nothing, so nothing
  // typed is the one figure a save is sent for.
  it("saves nothing typed as nothing for an owner with none", async () => {
    vi.mocked(saveQualifyingYears).mockResolvedValue(
      saved({ ...sam, qualifyingYears: 0 }),
    );
    renderTab();

    commit(years("Sam"), "0");

    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(
      sam.id,
      0,
      null,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "National Insurance record saved" }),
      ).toHaveAccessibleDescription("Sam · None");
    });
  });

  it("sends nothing for a figure typed back to what it was, or a tax year left empty", () => {
    renderTab();

    commit(years("Me"), "10");
    commit(through("Me"), "2024");
    commit(through("Sam"), "");

    expect(saveQualifyingYears).not.toHaveBeenCalled();
  });

  // Through 2025/26 the ten years count on to 33, which earn £11,831;
  // Sam's none are written as nothing beside the tax year.
  it("saves a tax year with the years shown, none being nothing, as the focus leaves it, what they earn following at once", async () => {
    const answer = Promise.withResolvers<Answer<Owner>>();
    vi.mocked(saveQualifyingYears).mockReturnValue(answer.promise);
    renderTab();

    commit(through("Me"), "2025");

    expect(
      await screen.findByRole("cell", { name: "£11,831 from 2058" }),
    ).toBeInTheDocument();

    commit(through("Sam"), "2025");

    expect(through("Me")).toHaveValue("2025");
    expect(vi.mocked(saveQualifyingYears).mock.calls).toStrictEqual([
      [me.id, 10, 2025],
      [sam.id, 0, 2025],
    ]);

    answer.resolve(saved({ ...me, qualifiedThrough: 2025 }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("dialog", {
          name: "National Insurance record saved",
        }),
      ).toHaveLength(2);
    });
  });

  it("saves a tax year cleared as none, the years then taken as they stand", async () => {
    const answer = Promise.withResolvers<Answer<Owner>>();
    vi.mocked(saveQualifyingYears).mockReturnValue(answer.promise);
    renderTab();

    commit(through("Me"), "");

    expect(through("Me")).toHaveValue("");
    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(
      me.id,
      10,
      null,
    );

    answer.resolve(saved({ ...owners[0], qualifyingYears: 10 }));

    await waitFor(() => {
      expect(through("Me")).toHaveValue("2024");
    });
  });

  it("holds the years to fifty at most", async () => {
    vi.mocked(saveQualifyingYears).mockResolvedValue(
      saved({ ...me, qualifyingYears: 50 }),
    );
    renderTab();

    commit(years("Me"), "80");

    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(
      me.id,
      50,
      null,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "National Insurance record saved" }),
      ).toHaveAccessibleDescription("Me · £12,548 from 2058");
    });
  });

  // The years typed afresh cleared the tax year shown, and both come
  // back with the refusal.
  it("puts the record back and says why when the store refuses it", async () => {
    vi.mocked(saveQualifyingYears).mockResolvedValue(
      refused("No owner has the id"),
    );
    renderTab();

    commit(years("Me"), "9");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", {
          name: "National Insurance record not saved",
        }),
      ).toHaveAccessibleDescription("No owner has the id");
    });
    expect(saveQualifyingYears).toHaveBeenCalledExactlyOnceWith(me.id, 9, null);
    await waitFor(() => {
      expect(years("Me")).toHaveValue("10");
    });
    expect(through("Me")).toHaveValue("2024");
  });

  // Sam retires with the plan's owner, so none through 2025/26 count on
  // to 23 through 2048/49 with them retiring at 59, which earn £8,246,
  // and to four, which earn nothing, with them retiring at 40.
  it("counts an owner retiring with the plan's owner to the retirement the plan lays out", () => {
    const partner = {
      ...sam,
      qualifiedThrough: 2025,
      qualifyingYears: 0,
      retirement: "retirement",
    } as const;
    const { rerender } = render(
      <StatePension owners={[partner]} plan={retiring} />,
    );

    expect(
      screen.getByRole("cell", { name: "£8,246 from 2061" }),
    ).toBeInTheDocument();

    rerender(
      <StatePension owners={[partner]} plan={retiringAt(retiring, 40)} />,
    );

    expect(screen.getByRole("cell", { name: "None" })).toBeInTheDocument();
  });
});
