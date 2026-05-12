"use client";

import { BookingStatusBadge } from "./BookingStatusBadge";

interface Booking {
  id: string;
  booking_ref: string | null;
  devotee_name: string | null;
  rasi: string | null;
  nakshatram: string | null;
  status: string;
  payment_link: string | null;
  confirmed_at: string | null;
  created_at: string;
  leads: { name: string | null; phone: string } | null;
}

export function BookingTable({ bookings }: { bookings: Booking[] }) {
  if (!bookings.length) {
    return (
      <div className="py-12 text-center font-body text-sm text-on-surface-muted">
        No bookings yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-surface-mid shadow-card">
      <table className="w-full text-sm">
        <thead className="bg-surface-low border-b border-surface-mid">
          <tr>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Reference</th>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Devotee</th>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Phone</th>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Rasi</th>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Nakshatram</th>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Status</th>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Booked</th>
            <th className="px-4 py-3 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-mid/50">
          {bookings.map((b) => (
            <tr key={b.id} className="hover:bg-surface-low/60 transition-colors">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-tertiary">
                {b.booking_ref ?? "—"}
              </td>
              <td className="px-4 py-3 font-body text-sm text-on-surface">{b.devotee_name ?? b.leads?.name ?? "—"}</td>
              <td className="px-4 py-3 font-body text-sm text-on-surface-muted">{b.leads?.phone ?? "—"}</td>
              <td className="px-4 py-3 font-body text-sm text-on-surface">{b.rasi ?? "—"}</td>
              <td className="px-4 py-3 font-body text-sm text-on-surface">{b.nakshatram ?? "—"}</td>
              <td className="px-4 py-3">
                <BookingStatusBadge status={b.status} />
              </td>
              <td className="px-4 py-3 font-label text-xs text-on-surface-muted">
                {new Date(b.created_at).toLocaleDateString("en-IN")}
              </td>
              <td className="px-4 py-3">
                {b.payment_link && b.status === "pending_payment" && (
                  <a
                    href={b.payment_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-label text-xs text-secondary hover:underline"
                  >
                    Payment Link ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
