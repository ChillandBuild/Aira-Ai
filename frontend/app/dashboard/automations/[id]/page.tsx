"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import AutomationBuilder, { type AutomationData } from "@/components/automations/automation-builder";
import { API_URL, getAuthHeaders } from "@/lib/api";

export default function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AutomationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/automations/${id}`, { headers: auth });
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-surface-subtle animate-pulse" />)}
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-on-surface-muted">Automation not found.</div>;
  }

  return <AutomationBuilder initial={data} />;
}
