// The record listed with the id, or a refusal saying none is, in the
// words of what the records are: an id is the caller's to have read off
// a list, so one no record has is a mistake and not a result.
export function found<TRecord extends { readonly id: number }>(
  records: readonly TRecord[],
  id: number,
  noun: string,
): TRecord {
  const record = records.find((listed) => listed.id === id);
  if (record === undefined) {
    throw new Error(`No ${noun} has the id`);
  }
  return record;
}

// The records with the one sharing the record's id written over by it,
// in its place, so an edit leaves a record where it was listed.
export function replaced<TRecord extends { readonly id: number }>(
  records: readonly TRecord[],
  record: TRecord,
): TRecord[] {
  return records.map((listed) => (listed.id === record.id ? record : listed));
}
