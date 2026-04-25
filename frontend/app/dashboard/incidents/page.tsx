"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { API_URL } from "@/lib/api";

type Incident = {
  id: string;
  type: string;
  phone_number_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  quality_yellow: "Number flagged Yellow — outbound volume halved",
  quality_red: "Number flagged Red — failover triggered",
  failover: "Standby promoted to primary",
  migration_sent: "Channel migration notice sent to recent leads",
  appeal_filed: "Meta appeal filed",
  standby_promoted: "Standby number promoted",
  warm_up_complete: "Number warm-up complete — now active",
};

const TYPE_BADGE: Record<string, string> = {
  quality_yellow: "bg-amber-100 text-amber-700",
  quality_red: "bg-red-100 text-red-700",
  failover: "bg-blue-100 text-blue-700",
  migration_sent: "bg-purple-100 text-purple-700",
  appeal_filed: "bg-orange-100 text-orange-700",
  standby_promoted: "bg-blue-100 text-blue-700",
  warm_up_complete: "bg-green-100 text-green-700",
};

const PAGE_SIZE = 50;

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function DetailExpander({ detail }: { detail: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(detail);
  if (keys.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 font-label text-xs text-on-surface-muted hover:text-on-surface transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {open ? "Hide detail" : "Show detail"}
      </button>
      {open && (
        <pre className="mt-2 p-3 rounded-lg bg-surface-low font-mono text-xs text-on-surface overflow-x-auto">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const badgeClass = TYPE_BADGE[incident.type] ?? "bg-surface-mid text-on-surface-muted";
  const label = TYPE_LABELS[incident.type] ?? incident.type.replace(/_/g, " ");

  return (
    <div className="flex gap-4 py-5 border-b border-surface-mid/50 last:border-0">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <div className="w-2.5 h-2.5 rounded-full bg-tertiary/30 ring-2 ring-tertiary/20 flex-shrink-0" />
        <div className="flex-1 w-px bg-surface-mid" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="font-label text-xs text-on-surface-muted whitespace-nowrap">
            {formatTimestamp(incident.created_at)}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-label text-xs font-semibold ${badgeClass}`}>
            {incident.type.replace(/_/g, "_")}
          </span>
        </div>
        <p className="font-body text-sm text-on-surface">{label}</p>
        <DetailExpander detail={incident.detail} />
      </div>
    </div>
  );
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchIncidents(currentOffset: number, append: boolean) {
    try {
      const result = await apiFetch<{ data: Incident[] }>(
        `/api/v1/incidents/?limit=${PAGE_SIZE}&offset=${currentOffset}`
      );
      const rows = result.data ?? [];
      setIncidents((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      // silent — keep stale data visible
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchIncidents(0, false).finally(() => setLoading(false));

    intervalRef.current = setInterval(() => {
      fetchIncidents(0, false);
    }, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleLoadMore() {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    await fetchIncidents(nextOffset, true);
    setOffset(nextOffset);
    setLoadingMore(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">Incident Log</h1>
        <p className="font-body text-on-surface-muted mt-1">
          A chronological record of number health events and system actions
        </p>
      </div>

      <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-bold text-tertiary">Timeline</h2>
          <span className="font-label text-xs text-on-surface-muted">
            Auto-refreshes every 30 s
          </span>
        </div>

        {loading ? (
          <p className="font-body text-sm text-on-surface-muted">Loading…</p>
        ) : incidents.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-body text-sm text-on-surface-muted">
              No incidents yet — your numbers are healthy
            </p>
          </div>
        ) : (
          <div>
            {incidents.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} />
            ))}

            {hasMore && (
              <div className="pt-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 bg-surface-low border border-surface-mid rounded-lg font-label text-xs font-semibold text-on-surface hover:bg-surface-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
