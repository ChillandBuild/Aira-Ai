const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:           { label: "Draft",            className: "bg-surface-mid text-on-surface-muted" },
  pending_payment: { label: "Awaiting Payment", className: "bg-amber-100 text-amber-800" },
  confirmed:       { label: "Confirmed",        className: "bg-green-100 text-green-800" },
  cancelled:       { label: "Cancelled",        className: "bg-red-100 text-red-700" },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-surface-mid text-on-surface-muted" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
