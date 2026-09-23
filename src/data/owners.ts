// An owner is one of the people the plan is for, whose ISAs and
// pensions are paid under their own allowances. The id is the owner's
// identity, handed out by the store, so an account names its owner
// rather than a name two owners could share, and the owners are listed
// in the order they were added.
export interface Owner extends OwnerValues {
  readonly id: number;
}

// The owner as its dialog holds it, which is the owner less its id: the
// name alone, which is what the accounts screen lists an owner by.
export interface OwnerValues {
  readonly name: string;
}
