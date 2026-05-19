import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900">
            Aira<span className="text-indigo-600">AI</span>
          </span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest border border-gray-200 rounded px-2 py-0.5">
            Operator Console
          </span>
        </div>
        <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to Dashboard
        </a>
      </header>
      <main className="max-w-5xl mx-auto px-8 py-8">{children}</main>
    </div>
  );
}
