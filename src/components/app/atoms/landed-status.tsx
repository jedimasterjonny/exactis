import type { JSX } from "react";

import { useState } from "react";

interface LandedStatusProps {
  readonly children: string;
  readonly isDone: boolean;
}

// What a run of the futures comes to, said to a screen reader once, as
// it lands: a status, there and empty from the first paint, holding its
// words only once the run is drawn after it was seen being drawn. So
// nothing is said as a screen opens on a run already drawn, as one
// handed back is, nor as each hand-over lands while it is drawn, and a
// run drawn again empties it and is said again as it lands. Unseen, and
// out of the flow, so it moves nothing.
export function LandedStatus({
  children,
  isDone,
}: LandedStatusProps): JSX.Element {
  const [isWaited, setIsWaited] = useState(!isDone);
  if (!isDone && !isWaited) {
    setIsWaited(true);
  }
  return (
    <p className="sr-only" role="status">
      {isDone && isWaited ? children : ""}
    </p>
  );
}
