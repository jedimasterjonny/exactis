import { Refusal } from "@/lib/answer";

// Where a save writes a record: over the one listed with the id, or as
// a new one given the household's next id when there is none, and the
// words the records are called by, for the refusal of an id none has.
interface Target {
  readonly at: null | number;
  readonly next: number;
  readonly noun: string;
}

// The record listed with the id, or a refusal saying none is, in the
// words of what the records are. An id is read off a list the page drew,
// so one no record has is a record another save has since taken away.
export function found<TRecord extends { readonly id: number }>(
  records: readonly TRecord[],
  id: number,
  noun: string,
): TRecord {
  const record = records.find((listed) => listed.id === id);
  if (record === undefined) {
    throw new Refusal(`No ${noun} has the id`);
  }
  return record;
}

// The records with the one listed with the id taken off, or a refusal
// saying none is. What goes with it is the caller's to take.
export function removed<TRecord extends { readonly id: number }>(
  records: readonly TRecord[],
  at: number,
  noun: string,
): TRecord[] {
  found(records, at, noun);
  return records.filter(({ id }) => id !== at);
}

// The records with the one sharing the record's id written over by it,
// in its place, so an edit leaves a record where it was listed.
export function replaced<TRecord extends { readonly id: number }>(
  records: readonly TRecord[],
  record: TRecord,
): TRecord[] {
  return records.map((listed) => (listed.id === record.id ? record : listed));
}

// The records with a record written in: over the one listed with the
// id, in its place, or added at the end under the next id, which then
// counts on past it. The record is the caller's to build, given the id
// it is written under and the one listed there, if any, so it can keep
// what the listed one holds that a save does not send. Hands back the
// records, the next id and the record as written.
export function written<TRecord extends { readonly id: number }>(
  records: readonly TRecord[],
  { at, next, noun }: Target,
  write: (id: number, listed: TRecord | undefined) => TRecord,
): {
  readonly next: number;
  readonly records: TRecord[];
  readonly written: TRecord;
} {
  if (at === null) {
    const record = write(next, undefined);
    return { next: next + 1, records: [...records, record], written: record };
  }
  const record = write(at, found(records, at, noun));
  return { next, records: replaced(records, record), written: record };
}
