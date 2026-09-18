// A count and what it counts, the noun in the plural unless there is one
// of it: "1 account", "4 accounts", "1 income line", "3 income lines".
// Every noun counted here takes a plain s, so the plural is the singular
// and a letter rather than a second word to be kept beside it.
export function counted(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}
