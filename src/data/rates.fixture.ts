import type { Allocation, Rates } from "@/data/rates";

// Rates typed by hand, as the assumptions screen's design shows them:
// stocks growing at 5.95% with a 2% yield on top, 7.95% in all, bonds at
// 4.45% and inflation at 2.95%. For tests.
export const rates: Rates = {
  bonds: 0.0445,
  dividends: 0.02,
  inflation: 0.0295,
  stocks: 0.0595,
};

// Four fifths of the savings in stocks and the rest in bonds. For tests.
export const allocation: Allocation = { stocks: 0.8 };
