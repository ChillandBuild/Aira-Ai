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
  LogOut, Inbox, Zap, TrendingUp, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiraLogo } from "./logo";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  feature?: string;
  badgeType?: "inbox" | "scheduled" | "drafts";
};

// Sub-menu groupings for WhatsApp and Telecalling
const WHATSAPP_ITEMS: NavItem[] = [
  { href: "/dashboard/inbox", icon: Inbox, label: "Inbox", badgeType: "inbox" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations" },
  { href: "/dashboard/upload", icon: Upload, label: "Upload" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates" },
  { href: "/dashboard/knowledge", icon: BookOpen, label: "Knowledge Base" },
  { href: "/dashboard/insights", icon: TrendingUp, label: "Insights" },
];

const TELECALLING_ITEMS: NavItem[] = [
  { href: "/dashboard/telecalling", icon: Phone, label: "Dialer" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Call Notes" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers Pool" },
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
      className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-150 font-body text-[13px] font-medium"
    >
      <LogOut size={15} />
      Sign out
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { role, enabledFeatures, loading: roleLoading } = useAuthRole();
  const [inboxCount, setInboxCount] = useState(0);
  
  // Track open/collapsed state of nested groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    WhatsApp: true,
    Telecalling: true,
  });

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const fetchCount = useCallback(async () => {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/chat-handovers/count`, { headers: auth });
      if (res.ok) setInboxCount((await res.json()).count ?? 0);
    } catch {}
  }, []);

  const waEnabled = enabledFeatures.includes("whatsapp");
  useEffect(() => {
    if (waEnabled) fetchCount();
  }, [waEnabled, fetchCount]);
  usePolling(fetchCount, 60_000, waEnabled);

  if (roleLoading) {
    return (
      <aside className="fixed left-0 top-0 h-full w-[220px] bg-[#fcfcfc] z-20 shadow-sidebar border-r border-zinc-200/50" />
    );
  }

  // Filter items by enabled features
  const filterEnabled = (items: NavItem[]) => 
    items.filter(item => !item.feature || enabledFeatures.includes(item.feature));

  const waGroupItems = filterEnabled(WHATSAPP_ITEMS);
  const tcGroupItems = filterEnabled(TELECALLING_ITEMS);

  const isWaActive = waGroupItems.some(item => pathname.startsWith(item.href));
  const isTcActive = tcGroupItems.some(item => pathname.startsWith(item.href));

  // Auto-expand active groups
  const showWa = expandedGroups.WhatsApp || isWaActive;
  const showTc = expandedGroups.Telecalling || isTcActive;

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-[#fcfcfc] flex flex-col z-20 shadow-sidebar border-r border-zinc-200/50 select-none">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <AiraLogo size={34} />
        <div>
          <span
            className="block text-zinc-900 font-display font-bold tracking-tight leading-none text-[15px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            Aira<span className="text-zinc-400 ml-0.5 font-normal">AI</span>
          </span>
          <span
            className="block text-zinc-400 font-label uppercase"
            style={{ fontSize: "0.55rem", letterSpacing: "0.1em", marginTop: "3px" }}
          >
            Lead Intelligence
          </span>
        </div>
      </div>

      <div className="mx-5 h-px bg-zinc-200/60" />

      <div className="flex-grow overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin">
        {/* TOP LEVEL: Overview */}
        {role === "owner" && (
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group",
              pathname === "/dashboard"
                ? "bg-zinc-100 text-zinc-950 font-semibold"
                : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-950"
            )}
          >
            <LayoutDashboard size={15} className={pathname === "/dashboard" ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span>Dashboard</span>
          </Link>
        )}

        {/* TOP LEVEL: Leads */}
        {role === "owner" && (
          <Link
            href="/dashboard/leads"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group",
              pathname.startsWith("/dashboard/leads")
                ? "bg-zinc-100 text-zinc-950 font-semibold"
                : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-950"
            )}
          >
            <Users size={15} className={pathname.startsWith("/dashboard/leads") ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span>Leads</span>
          </Link>
        )}

        {/* GROUP: WhatsApp messaging */}
        {enabledFeatures.includes("whatsapp") && waGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("WhatsApp")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-[13px] font-medium text-left transition-all group",
                isWaActive ? "text-zinc-950 font-semibold" : "text-zinc-600 hover:bg-zinc-100/40"
              )}
            >
              <MessageSquare size={15} className={isWaActive ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
              <span className="flex-1">WhatsApp</span>
              {showWa ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />}
            </button>

            {/* Tree items */}
            {showWa && (
              <div className="space-y-0.5">
                {waGroupItems.map((item, idx) => {
                  const active = pathname.startsWith(item.href);
                  const isLast = idx === waGroupItems.length - 1;
                  const badgeCount = item.badgeType === "inbox" && inboxCount > 0 ? inboxCount : null;

                  return (
                    <div key={item.href} className="relative pl-6 flex items-center h-8.5">
                      {/* Curved branch lines */}
                      <div
                        className={cn(
                          "absolute left-3 w-px bg-zinc-200",
                          isLast ? "top-0 h-4" : "-top-1 bottom-0"
                        )}
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1 w-3 h-3.5 border-l border-b border-zinc-200 rounded-bl-lg" />

                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 ml-2.5 px-3 py-1.5 w-[150px] rounded-lg text-xs transition-all duration-150 group",
                          active
                            ? "bg-white shadow-sm border border-zinc-200/50 text-zinc-950 font-semibold"
                            : "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100/40"
                        )}
                      >
                        <span className="truncate flex-1">{item.label}</span>
                        {badgeCount && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold text-[9px] min-w-[16px] text-center">
                            {badgeCount}
                          </span>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* GROUP: Telecalling */}
        {enabledFeatures.includes("telecalling") && tcGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("Telecalling")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-[13px] font-medium text-left transition-all group",
                isTcActive ? "text-zinc-950 font-semibold" : "text-zinc-600 hover:bg-zinc-100/40"
              )}
            >
              <Phone size={15} className={isTcActive ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
              <span className="flex-1">Telecalling</span>
              {showTc ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />}
            </button>

            {/* Tree items */}
            {showTc && (
              <div className="space-y-0.5">
                {tcGroupItems.map((item, idx) => {
                  const active = pathname.startsWith(item.href);
                  const isLast = idx === tcGroupItems.length - 1;

                  return (
                    <div key={item.href} className="relative pl-6 flex items-center h-8.5">
                      {/* Curved branch lines */}
                      <div
                        className={cn(
                          "absolute left-3 w-px bg-zinc-200",
                          isLast ? "top-0 h-4" : "-top-1 bottom-0"
                        )}
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1 w-3 h-3.5 border-l border-b border-zinc-200 rounded-bl-lg" />

                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 ml-2.5 px-3 py-1.5 w-[150px] rounded-lg text-xs transition-all duration-150 group",
                          active
                            ? "bg-white shadow-sm border border-zinc-200/50 text-zinc-950 font-semibold"
                            : "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100/40"
                        )}
                      >
                        <span className="truncate flex-1">{item.label}</span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TOP LEVEL: Automations */}
        {role === "owner" && (
          <Link
            href="/dashboard/automations"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group",
              pathname.startsWith("/dashboard/automations")
                ? "bg-zinc-100 text-zinc-950 font-semibold"
                : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-950"
            )}
          >
            <Zap size={15} className={pathname.startsWith("/dashboard/automations") ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span>Automations</span>
          </Link>
        )}

        {/* TOP LEVEL: Analytics */}
        {role === "owner" && (
          <Link
            href="/dashboard/analytics"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group",
              pathname.startsWith("/dashboard/analytics")
                ? "bg-zinc-100 text-zinc-950 font-semibold"
                : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-950"
            )}
          >
            <BarChart2 size={15} className={pathname.startsWith("/dashboard/analytics") ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span>Analytics</span>
          </Link>
        )}

        {/* TOP LEVEL: Team */}
        {role === "owner" && (
          <Link
            href="/dashboard/team"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group",
              pathname.startsWith("/dashboard/team")
                ? "bg-zinc-100 text-zinc-950 font-semibold"
                : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-950"
            )}
          >
            <Users size={15} className={pathname.startsWith("/dashboard/team") ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span>Team</span>
          </Link>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-3 pb-4 space-y-1.5">
        <div className="mx-2 mb-2 h-px bg-zinc-200/60" />

        {role === "owner" && (
          <Link
            href="/dashboard/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group",
              pathname.startsWith("/dashboard/settings")
                ? "bg-zinc-100 text-zinc-950 font-semibold"
                : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-950"
            )}
          >
            <Settings size={15} className={pathname.startsWith("/dashboard/settings") ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span>Settings</span>
          </Link>
        )}

        <div className="px-2 pt-1">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="font-label text-emerald-600 font-bold tracking-wider" style={{ fontSize: "0.55rem" }}>
              ALL SYSTEMS ONLINE
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-200/60">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
