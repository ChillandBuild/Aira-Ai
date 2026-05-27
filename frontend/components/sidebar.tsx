"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthRole, clearRoleCache } from "@/app/dashboard/contexts/AuthRoleContext";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import {
  LayoutDashboard, MessageSquare, Users, Settings, Phone,
  BarChart2, Upload, BookOpen, Layers, FileCheck, StickyNote,
  LogOut, Inbox, Zap, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiraLogo } from "./logo";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  feature?: string;
};

const OWNER_NAV: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations", feature: "whatsapp" },
  { href: "/dashboard/inbox", icon: Inbox, label: "Inbox", feature: "whatsapp" },
  { href: "/dashboard/leads", icon: Users, label: "Leads" },
  { href: "/dashboard/upload", icon: Upload, label: "Upload", feature: "whatsapp" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling", feature: "telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes", feature: "telecalling" },
  { href: "/dashboard/knowledge", icon: BookOpen, label: "Knowledge", feature: "whatsapp" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers", feature: "telecalling" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates", feature: "whatsapp" },
  { href: "/dashboard/automations", icon: Zap, label: "Automations" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/dashboard/insights", icon: TrendingUp, label: "Insights", feature: "whatsapp" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
];

const CALLER_NAV: NavItem[] = [
  { href: "/dashboard/profile", icon: Users, label: "My Profile" },
  { href: "/dashboard/inbox", icon: Inbox, label: "Inbox", feature: "whatsapp" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations" },
];

const BOTTOM_NAV: NavItem[] = [
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    clearRoleCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-2.5 w-full rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-150 font-label text-sm font-medium"
    >
      <LogOut size={16} />
      Sign out
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { role, enabledFeatures, loading: roleLoading } = useAuthRole();
  const [inboxCount, setInboxCount] = useState(0);

  const waEnabled = enabledFeatures.includes("whatsapp");
  const fetchCount = useCallback(async () => {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/chat-handovers/count`, { headers: auth });
      if (res.ok) setInboxCount((await res.json()).count ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    if (waEnabled) fetchCount();
  }, [waEnabled, fetchCount]);
  usePolling(fetchCount, 60_000, waEnabled);

  if (roleLoading) {
    return (
      <aside className="fixed left-0 top-0 h-full w-[220px] bg-[#0c0a21] z-20 shadow-sidebar border-r border-slate-900/60" />
    );
  }

  const baseNav = role === "owner" ? OWNER_NAV : role === "caller" ? CALLER_NAV : [];
  const activeNav = baseNav.filter(
    (item) => !item.feature || enabledFeatures.includes(item.feature)
  );

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-[#0c0a21] flex flex-col z-20 shadow-sidebar border-r border-slate-900/60">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <AiraLogo size={36} />
        <div>
          <span
            className="block text-white font-display font-bold tracking-tight leading-none text-base"
            style={{ letterSpacing: "-0.03em" }}
          >
            Aira<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366f1] to-[#14b8a6] ml-0.5">AI</span>
          </span>
          <span
            className="block text-slate-500 font-label uppercase"
            style={{ fontSize: "0.55rem", letterSpacing: "0.12em", marginTop: "3px" }}
          >
            Lead Intelligence
          </span>
        </div>
      </div>

      <div className="mx-5 h-px bg-slate-800/40" />

      <p className="px-5 pt-4 pb-1 font-label text-slate-500 uppercase tracking-widest" style={{ fontSize: "0.55rem" }}>
        Workspace
      </p>

      <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
        {activeNav.map(({ href, icon: Icon, label }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          const badge = href === "/dashboard/inbox" && inboxCount > 0 ? inboxCount : null;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group relative",
                active
                  ? "bg-white/10 text-white font-medium shadow-sm"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-[#6366f1] to-[#14b8a6]" />
              )}
              <Icon
                size={16}
                className={cn(
                  "transition-colors duration-150 flex-shrink-0",
                  active ? "text-[#818cf8]" : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              <span className="font-body text-sm flex-1">{label}</span>
              {badge && (
                <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 space-y-0.5">
        <div className="mx-2 mb-2 h-px bg-slate-800/40" />

        {role === "owner" && BOTTOM_NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group",
                active
                  ? "bg-white/10 text-white font-medium shadow-sm"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon
                size={16}
                className={cn(
                  "flex-shrink-0 transition-colors duration-150",
                  active ? "text-[#818cf8]" : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              <span className="font-body text-sm">{label}</span>
            </Link>
          );
        })}

        <div className="px-2 pt-2">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="font-label text-emerald-400 font-bold tracking-wider" style={{ fontSize: "0.55rem" }}>
              ALL SYSTEMS ONLINE
            </span>
          </div>
        </div>
        <div className="mt-auto pt-3 border-t border-slate-800/40 px-0">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}

