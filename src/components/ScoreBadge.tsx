import { cn } from "@/lib/utils";

export function ScoreBadge({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value == null) {
    return (
      <span
        className={cn(
          "inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        —
      </span>
    );
  }
  const tone =
    value >= 7
      ? "bg-success/15 text-success"
      : value >= 5
        ? "bg-warning/20 text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md text-xs font-semibold tabular-nums",
        tone,
        className,
      )}
    >
      {value.toFixed(1)}
    </span>
  );
}

export function ActionBadge({
  action,
}: {
  action: "BID" | "REVIEW" | "SKIP" | null | undefined;
}) {
  if (!action) return null;
  const map = {
    BID: "bg-success/15 text-success",
    REVIEW: "bg-warning/20 text-warning-foreground",
    SKIP: "bg-muted text-muted-foreground",
  } as const;
  const label =
    action === "BID" ? "BUD" : action === "REVIEW" ? "VURDER" : "HOPP OVER";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        map[action],
      )}
    >
      {label}
    </span>
  );
}
