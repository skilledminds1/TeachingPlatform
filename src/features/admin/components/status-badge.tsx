import { cn } from "@/lib/utils";

const toneClasses = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-500",
  warning: "bg-amber-500/10 text-amber-500",
  danger: "bg-destructive/10 text-destructive",
} as const;

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(
  status: string,
): keyof typeof toneClasses {
  if (["approved", "active", "completed", "ended"].includes(status)) return "success";
  if (["pending", "pending_approval", "trialing", "scheduled"].includes(status)) return "warning";
  if (["rejected", "cancelled", "past_due"].includes(status)) return "danger";
  if (["confirmed", "live"].includes(status)) return "info";
  return "neutral";
}
