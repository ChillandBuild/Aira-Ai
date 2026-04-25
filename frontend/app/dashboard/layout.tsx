import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-[220px] flex-1 min-h-screen">
        <div className="p-7 max-w-[1400px]">
          {children}
        </div>
      </main>
    </div>
  );
}
