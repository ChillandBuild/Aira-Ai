import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientLayout } from "./ClientLayout";

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
      // Backend down
    }
  }

  return (
    <ClientLayout>
      {children}
    </ClientLayout>
  );
}
