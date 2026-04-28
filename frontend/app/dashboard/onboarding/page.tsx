"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.onboarding.create(name.trim());
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="card rounded-3xl p-8">
          <h1 className="font-display text-xl font-bold text-ink mb-1">Welcome to Aira AI</h1>
          <p className="font-body text-sm text-ink-muted mb-6">
            Enter your business name to set up your workspace.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 font-body text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                Business / Organisation Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input"
                placeholder="e.g. Sunrise University"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary w-full justify-center"
            >
              {loading ? "Creating…" : "Create Workspace"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
