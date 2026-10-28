import type { LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/kit/empty";

interface EmptyStateProps {
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly title: string;
}

// What a region draws when it holds nothing: an icon, a title saying so
// and a sentence saying what would fill it, with whatever the caller
// gives beneath, a link to where the filling is done. The words are the
// caller's, since two regions of the same shape want different
// sentences. A header row over no rows states column names and no
// information, so a region holding nothing draws this instead.
export function EmptyState({
  children,
  className,
  description,
  icon,
  title,
}: EmptyStateProps): JSX.Element {
  const Icon = icon;
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children !== undefined && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
