import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { AuthRoleProvider } from "./contexts/AuthRoleContext";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (token) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.has_tenant) {
          redirect("/dashboard/onboarding");
        }
      }
    } catch {
      // Backend down — let through, don't block dashboard
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-[220px] flex-1 min-h-screen">
        <div className="p-7 max-w-[1400px]">
          <AuthRoleProvider>
            {children}
          </AuthRoleProvider>
        </div>
      </main>
    </div>
  );
}
