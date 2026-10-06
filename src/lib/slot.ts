import type { ReactNode } from "react";

// What a slot takes: anything React draws but what a condition that came
// out false gives, so a slot filled as cond && <x /> is a type error rather
// than an empty box where the slot would be, and an optional slot the
// caller leaves empty is left undefined, which a ternary says.
export type Slot = Exclude<ReactNode, boolean | null>;
