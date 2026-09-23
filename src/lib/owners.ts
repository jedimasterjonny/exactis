import type { Owner } from "@/data/owners";
import type { Option } from "@/lib/options";

// The owner a wrapper opens on in a dialog: its own, or the first the
// plan has for one that has none yet, or none at all while the plan has
// no owner to give it. The field mounts showing it and the draft takes
// the same, so the two agree before anything is chosen.
export function ownerFor(
  owner: null | number,
  owners: readonly Owner[],
): null | number {
  return owner ?? owners[0]?.id ?? null;
}

// The owner choice's options: each owner by its id, as the select's
// string, since two may share a name; or, while the plan has no owner at
// all, one saying so, standing for none, which the field shows disabled.
export function ownerOptions(
  owners: readonly Owner[],
): readonly Option<string>[] {
  return owners.length === 0
    ? [{ label: "No owners yet", value: "" }]
    : owners.map((owner) => ({ label: owner.name, value: String(owner.id) }));
}
