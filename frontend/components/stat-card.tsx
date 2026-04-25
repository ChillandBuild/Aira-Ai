"use client";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div
      className={cn(
        "card card-hover rounded-3xl",
        accent
          ? "border-transparent text-white"
          : "bg-surface"
      )}
      style={accent ? { background: "linear-gradient(135deg, #059669 0%, #047857 100%)" } : {}}
    >
      <p className={cn(
        "stat-label mb-3",
        accent ? "text-white/60" : ""
      )}>
        {label}
      </p>
      <p className={cn(
        "stat-num",
        accent ? "text-white" : "text-ink"
      )}>
        {value}
      </p>
      {sub && (
        <p className={cn(
          "mt-1.5 font-body text-sm",
          accent ? "text-white/60" : "text-ink-muted"
        )}>
          {sub}
        </p>
      )}
    </div>
  );
}
