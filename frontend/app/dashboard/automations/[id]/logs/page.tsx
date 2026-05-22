"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface StepResult {
  step_id?: string;
  step_type?: string;
  status: string;
  detail?: string;
  branch?: string;
}

interface AutomationLog {
  id: string;
  trigger_type: string;
  status: "success" | "partial" | "failure";
  steps_results: StepResult[];
  created_at: string;
  lead_id?: string;
}

const STATUS_ICON = {
  success: <CheckCircle2 size={15} className="text-emerald-500" />,
  partial: <AlertCircle size={15} className="text-amber-500" />,
  failure: <XCircle size={15} className="text-red-500" />,
};

const STATUS_BG = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  failure: "bg-red-50 text-red-700 border-red-200",
};

const STEP_STATUS_ICON: Record<string, React.ReactNode> = {
  ok: <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />,
  skipped: <AlertCircle size={13} className="text-slate-400 shrink-0" />,
  wait: <AlertCircle size={13} className="text-amber-500 shrink-0" />,
  error: <XCircle size={13} className="text-red-500 shrink-0" />,
};

function LogRow({ log }: { log: AutomationLog }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-surface-mid bg-surface overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {STATUS_ICON[log.status]}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BG[log.status]}`}>
              {log.status}
            </span>
            <span className="text-xs text-on-surface-muted">{log.trigger_type}</span>
          </div>
          <p className="text-[11px] text-on-surface-muted mt-0.5">
            {new Date(log.created_at).toLocaleString()} · {log.steps_results.length} step{log.steps_results.length !== 1 ? "s" : ""}
          </p>
        </div>
        {expanded ? <ChevronUp size={14} className="text-on-surface-muted" /> : <ChevronDown size={14} className="text-on-surface-muted" />}
      </div>
      {expanded && (
        <div className="border-t border-surface-mid px-4 pb-4 pt-3 space-y-2">
          {log.steps_results.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              {STEP_STATUS_ICON[r.status] || STEP_STATUS_ICON.error}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-on-surface">{r.step_type || `Step ${i + 1}`}</span>
                {r.branch && (
                  <span className={`ml-1.5 text-[10px] font-bold ${r.branch === "yes" ? "text-emerald-600" : "text-red-500"}`}>
                    [{r.branch.toUpperCase()}]
                  </span>
                )}
                {r.detail && <p className="text-[11px] text-on-surface-muted mt-0.5 break-all">{r.detail}</p>}
              </div>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                r.status === "ok" ? "bg-emerald-50 text-emerald-700" :
                r.status === "skipped" ? "bg-slate-100 text-slate-500" :
                r.status === "wait" ? "bg-amber-50 text-amber-700" :
                "bg-red-50 text-red-600"
              }`}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AutomationLogsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/automations/${id}/logs`, { headers: auth });
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data || []);
      }
      setLoading(false);
    })();
  }, [id]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-surface-subtle text-on-surface-muted transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-on-surface">Execution Logs</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-surface-subtle animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20 text-on-surface-muted">
          <p className="font-medium">No executions yet</p>
          <p className="text-sm mt-1">Logs will appear here when this automation runs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => <LogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}
