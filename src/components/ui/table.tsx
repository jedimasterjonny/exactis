import { cn } from "cn";
import * as React from "react";

function Table({
  className,
  ...props
}: React.ComponentProps<"table">): React.JSX.Element {
  return (
    <div
      className="relative w-full overflow-x-auto"
      data-slot="table-container"
    >
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        data-slot="table"
        {...props}
      />
    </div>
  );
}

function TableBody({
  className,
  ...props
}: React.ComponentProps<"tbody">): React.JSX.Element {
  return (
    <tbody
      className={cn("[&_tr:last-child]:border-0", className)}
      data-slot="table-body"
      {...props}
    />
  );
}

function TableCell({
  className,
  ...props
}: React.ComponentProps<"td">): React.JSX.Element {
  return (
    <td
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      data-slot="table-cell"
      {...props}
    />
  );
}

function TableHead({
  className,
  ...props
}: React.ComponentProps<"th">): React.JSX.Element {
  return (
    <th
      className={cn(
        "h-10 px-2 text-left align-middle label whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      data-slot="table-head"
      {...props}
    />
  );
}

function TableHeader({
  className,
  ...props
}: React.ComponentProps<"thead">): React.JSX.Element {
  return (
    <thead
      className={cn("[&_tr]:border-b", className)}
      data-slot="table-header"
      {...props}
    />
  );
}

function TableRow({
  className,
  ...props
}: React.ComponentProps<"tr">): React.JSX.Element {
  return (
    <tr
      className={cn(
        "border-b transition-colors has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      data-slot="table-row"
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
