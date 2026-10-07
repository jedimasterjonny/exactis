import type { JSX } from "react";

import { cn } from "cn";

// A part of a whole, drawn as long as its value, in its tone, given as
// the whole class, since Tailwind reads class names whole.
interface Segment {
  readonly key: string;
  readonly tone: string;
  readonly value: number;
}

interface SegmentBarProps {
  readonly groups: readonly (readonly Segment[])[];
  readonly total?: number;
}

// A whole split into its parts, as one bar: the groups side by side
// with a wider gap between them, each part as long as its value, and,
// where the parts come to less than the total given, what is still to
// come as a muted rest, so the bar fills as it comes in. Drawn, since
// what it splits is written beside it, and hidden from the
// accessibility tree for the same reason. A part of nothing or less
// draws nothing and counts for nothing against the total, and one too
// small to see is drawn as a sliver all the same, so the bar misses no
// part the words beside it name. Two groups may
// list the same parts, as a gain and a loss do, each holding those that
// come to something on its side, so a group is known by what it holds.
export function SegmentBar({
  groups,
  total = 0,
}: SegmentBarProps): JSX.Element {
  const drawn = groups
    .flat()
    .reduce((sum, { value }) => sum + Math.max(0, value), 0);
  return (
    <span aria-hidden className="flex h-3 gap-1" data-slot="segment-bar">
      {groups.map((group) => {
        const held = group.filter(({ value }) => value > 0);
        const sum = held.reduce((whole, { value }) => whole + value, 0);
        return (
          sum > 0 && (
            <span
              className="flex basis-0 gap-0.5"
              key={held.map(({ key }) => key).join()}
              style={{ flexGrow: sum }}
            >
              {held.map(({ key, tone, value }) => (
                <span
                  className={cn("min-w-1 basis-0 rounded-sm", tone)}
                  data-segment={key}
                  data-slot="segment-bar-part"
                  key={key}
                  style={{ flexGrow: value }}
                />
              ))}
            </span>
          )
        );
      })}
      {drawn < total && (
        <span
          className="basis-0 rounded-sm bg-muted"
          data-slot="segment-bar-rest"
          style={{ flexGrow: total - drawn }}
        />
      )}
    </span>
  );
}
