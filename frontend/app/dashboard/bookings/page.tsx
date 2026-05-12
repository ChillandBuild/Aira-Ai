"use client";

import { useEffect, useState } from "react";
import { BookingTable } from "./components/BookingTable";
import { Booking } from "./types";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Awaiting Payment", value: "pending_payment" },
  { label: "Draft", value: "draft" },
  { label: "Cancelled", value: "cancelled" },
];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "100" });
    if (statusFilter) params.set("status", statusFilter);

    fetch(`/api/v1/bookings?${params}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        setBookings(d.data ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const confirmed = bookings.filter((b) => b.status === "confirmed").length;
  const pending   = bookings.filter((b) => b.status === "pending_payment").length;
  const draft     = bookings.filter((b) => b.status === "draft").length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-tertiary">Bookings</h1>
        <p className="font-body text-sm text-on-surface-muted mt-1">Guru Peyarchi Homam — {total} total</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Confirmed",        value: confirmed, color: "text-green-600" },
          { label: "Awaiting Payment", value: pending,   color: "text-amber-600" },
          { label: "Draft",            value: draft,     color: "text-on-surface-muted" },
        ].map((card) => (
          <div key={card.label} className="bg-surface rounded-card border border-surface-mid shadow-card p-5">
            <p className="font-label text-xs text-on-surface-muted uppercase tracking-wider">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-1.5 rounded-full font-label text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-tertiary text-white"
                : "bg-surface-mid text-on-surface-muted hover:bg-surface-low hover:text-on-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center font-body text-sm text-on-surface-muted">Loading bookings…</div>
      ) : (
        <BookingTable bookings={bookings} />
      )}
    </div>
  );
}
