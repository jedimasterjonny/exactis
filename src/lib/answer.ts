// What an action answers a save with: what it saved, or why it refused
// to. A refusal is an answer rather than a throw, since a server
// action's error reaches a production browser with its words withheld,
// and a refusal is nothing but its words: why the save was not made,
// for the screen to say. A post only a bug or a forgery could send is
// not refused but fails loudly, as the development sign-in's closed
// door does, and so does a store that cannot answer.
export type Answer<TValue> =
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "saved"; readonly value: TValue };

// A rule a save breaks, thrown where the rule is held and answered as a
// refusal by the store's save, which is the one place a save is made.
// Anything else thrown on the way stays a failure.
export class Refusal extends Error {}

// What a saved answer holds, or the refusal thrown in the browser in its
// own words, for a caller that reports either under the one toast.
export function acceptedOf<TValue>(answer: Answer<TValue>): TValue {
  switch (answer.kind) {
    case "refused":
      throw new Error(answer.reason);
    case "saved":
      return answer.value;
  }
}

export function refused(reason: string): Answer<never> {
  return { kind: "refused", reason };
}

export function saved<TValue>(value: TValue): Answer<TValue> {
  return { kind: "saved", value };
}
