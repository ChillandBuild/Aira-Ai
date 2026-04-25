"use client";
import { cn } from "@/lib/utils";

const SEGMENT_CONFIG = {
  A: { label: "Hot", bg: "bg-secondary-bg", text: "text-secondary-text" },
  B: { label: "Warm", bg: "bg-tertiary-bg", text: "text-tertiary" },
  C: { label: "Cold", bg: "bg-surface-mid", text: "text-on-surface-muted" },
  D: { label: "Disq.", bg: "bg-[#f0f0f0]", text: "text-[#666]" },
};

export function SegmentBadge({ segment }: { segment: "A" | "B" | "C" | "D" }) {
  const cfg = SEGMENT_CONFIG[segment];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label text-xs font-semibold",
        cfg.bg,
        cfg.text
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {segment} · {cfg.label}
    </span>
  );
}
