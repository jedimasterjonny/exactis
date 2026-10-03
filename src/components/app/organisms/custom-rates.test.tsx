import type { ComponentProps } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Allocation, Rates } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { saveAllocation, saveRates } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { allocation, rates } from "@/data/rates.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field, worksheet } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { CustomRates } from "./custom-rates";

vi.mock("@/actions/plan", () => ({
  saveAllocation: vi.fn(),
  saveRates: vi.fn(),
}));

// The worksheet's name.
const sheet = "Custom rates, worked out";

// The design's rates typed by hand and four fifths in stocks, with what
// is given in their place. A save reports through the toast manager,
// which needs its Toaster mounted.
function renderRates(
  given: Partial<ComponentProps<typeof CustomRates>> = {},
): void {
  render(<CustomRates allocation={allocation} rates={rates} {...given} />, {
    wrapper: Toaster,
  });
}

describe("CustomRates", () => {
  // 5.95% and 2% make 7.95%, and four fifths of it and a fifth of bonds'
  // 4.45% make 7.25%, made of 5.65% growth and 1.60% yield. Over 2.95%
  // of inflation those are 4.86%, 1.46% and 4.18%, where subtracting
  // would give 5.00%, 1.50% and 4.30%.
  it("shows each rate and the split as typed, and works them out as the CMA's are", () => {
    renderRates();

    expect(field("Stocks growth")).toHaveValue("5.95%");
    expect(field("Dividend yield")).toHaveValue("2.00%");
    expect(field("Bonds growth")).toHaveValue("4.45%");
    expect(field("Inflation")).toHaveValue("2.95%");
    expect(field("Stocks share")).toHaveValue("80.00%");
    expect(field("Stocks growth")).toHaveAccessibleDescription("Typed by hand");
    expect(field("Dividend yield")).toHaveAccessibleDescription(
      "Added to growth — always change the pair",
    );
    expect(field("Inflation")).toHaveAccessibleDescription(
      "Typed by hand — the BoE derivation below is ignored",
    );
    expect(field("Stocks share")).toHaveAccessibleDescription(
      "The rest is held in bonds, flat for life",
    );
    expect(worksheet(sheet)).toStrictEqual([
      ["Weight", "80.00%", "20.00%", "100.00%"],
      ["Return", "7.95%", "4.45%", "7.25%"],
      ["Growth", "5.95%", "4.45%", "5.65%"],
      ["Dividend yield", "2.00%", "—", "1.60%"],
      ["Real return", "4.86%", "1.46%", "4.18%"],
    ]);
    expect(
      screen.getByRole("rowheader", { name: "Real return" }),
    ).toHaveAccessibleDescription(
      "Over 2.95% inflation, compounded rather than subtracted",
    );
  });

  // 6.45% and 2% make 8.45%, 5.34% real, and the portfolio 7.65%, 4.57%
  // real. The stored rates come back with the page rather than with the
  // answer, so once the store has answered the worksheet shows the rates
  // it was given again.
  it("saves a rate alone as the focus leaves it, the worksheet following at once", async () => {
    const answer = heldBack<Answer<Rates>>();
    vi.mocked(saveRates).mockReturnValue(answer.promise);
    renderRates();

    commit(field("Stocks growth"), "6.45");

    await waitFor(() => {
      expect(worksheet(sheet)[1]).toStrictEqual([
        "Return",
        "8.45%",
        "4.45%",
        "7.65%",
      ]);
    });
    expect(worksheet(sheet)[4]).toStrictEqual([
      "Real return",
      "5.34%",
      "1.46%",
      "4.57%",
    ]);
    expect(field("Stocks growth")).toHaveValue("6.45%");
    expect(saveRates).toHaveBeenCalledExactlyOnceWith({ stocks: 0.0645 });

    answer.answer(saved({ ...rates, stocks: 0.0645 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Rates saved" }),
      ).toHaveAccessibleDescription(
        "Stocks 8.45% · bonds 4.45% · inflation 2.95%",
      );
    });
    await waitFor(() => {
      expect(worksheet(sheet)[1]?.[1]).toBe("7.95%");
    });
  });

  it.each([
    ["Stocks growth", "6", { stocks: 0.06 }],
    ["Dividend yield", "2.5", { dividends: 0.025 }],
    ["Bonds growth", "4", { bonds: 0.04 }],
    ["Inflation", "2.5", { inflation: 0.025 }],
  ] as const)(
    "sends what is typed into %s alone, under its own name",
    async (name, typed, patch) => {
      vi.mocked(saveRates).mockResolvedValue(saved({ ...rates, ...patch }));
      renderRates();

      commit(field(name), typed);

      expect(saveRates).toHaveBeenCalledExactlyOnceWith(patch);
      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: "Rates saved" }),
        ).toBeInTheDocument();
      });
    },
  );

  it("sends nothing for a rate typed back to what it was", () => {
    renderRates();

    commit(field("Bonds growth"), "4.45");

    expect(field("Bonds growth")).toHaveValue("4.45%");
    expect(saveRates).not.toHaveBeenCalled();
  });

  // Inflation carried in off a curve at 3.0459% shows as 3.05%, and the
  // field commits 3.05% as the focus leaves it, typed or not.
  it("sends nothing for a rate the focus only passed through, however finely it is kept", () => {
    renderRates({ rates: { ...rates, inflation: 0.030459 } });

    fireEvent.focus(field("Inflation"));
    fireEvent.blur(field("Inflation"));

    expect(field("Inflation")).toHaveValue("3.05%");
    expect(saveRates).not.toHaveBeenCalled();
  });

  it("puts the rate back and says why when the store refuses it", async () => {
    vi.mocked(saveRates).mockResolvedValue(
      refused("A dividend yield is nothing or more"),
    );
    renderRates();

    commit(field("Inflation"), "3.1");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Rates not saved" }),
      ).toHaveAccessibleDescription("A dividend yield is nothing or more");
    });
    expect(saveRates).toHaveBeenCalledExactlyOnceWith({ inflation: 0.031 });
    await waitFor(() => {
      expect(field("Inflation")).toHaveValue("2.95%");
    });
  });

  // Three fifths at 7.95% and two at 4.45% make 6.55%, 3.50% real, made
  // of 5.35% growth and 1.20% yield. The stored split comes back with
  // the page rather than with the answer, so once the store has answered
  // the worksheet shows the split it was given again.
  it("saves the share in stocks as the focus leaves it, the worksheet following at once", async () => {
    const answer = heldBack<Answer<Allocation>>();
    vi.mocked(saveAllocation).mockReturnValue(answer.promise);
    renderRates();

    commit(field("Stocks share"), "60");

    await waitFor(() => {
      expect(worksheet(sheet)).toStrictEqual([
        ["Weight", "60.00%", "40.00%", "100.00%"],
        ["Return", "7.95%", "4.45%", "6.55%"],
        ["Growth", "5.95%", "4.45%", "5.35%"],
        ["Dividend yield", "2.00%", "—", "1.20%"],
        ["Real return", "4.86%", "1.46%", "3.50%"],
      ]);
    });
    expect(saveAllocation).toHaveBeenCalledExactlyOnceWith({ stocks: 0.6 });

    answer.answer(saved({ stocks: 0.6 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation saved" }),
      ).toHaveAccessibleDescription("60.00% in stocks, 40.00% in bonds");
    });
    await waitFor(() => {
      expect(worksheet(sheet)[1]?.[3]).toBe("7.25%");
    });
  });

  it("holds the share between none of the savings and all of them", async () => {
    vi.mocked(saveAllocation).mockResolvedValue(saved({ stocks: 1 }));
    renderRates();

    commit(field("Stocks share"), "120");

    expect(saveAllocation).toHaveBeenCalledExactlyOnceWith({ stocks: 1 });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation saved" }),
      ).toBeInTheDocument();
    });
  });

  it("sends nothing for a share typed back to what it was", () => {
    renderRates();

    commit(field("Stocks share"), "80");

    expect(saveAllocation).not.toHaveBeenCalled();
  });

  it("puts the share back and says why when the store refuses it", async () => {
    vi.mocked(saveAllocation).mockResolvedValue(
      refused(
        "The household changed while this was being saved, so nothing was",
      ),
    );
    renderRates();

    commit(field("Stocks share"), "50");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not saved" }),
      ).toHaveAccessibleDescription(
        "The household changed while this was being saved, so nothing was",
      );
    });
    await waitFor(() => {
      expect(field("Stocks share")).toHaveValue("80.00%");
    });
  });
});
