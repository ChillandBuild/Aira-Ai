"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthRole, clearRoleCache } from "@/app/dashboard/contexts/AuthRoleContext";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  LayoutDashboard, MessageSquare, Users, Settings, Phone,
  BarChart2, Upload, BookOpen, Layers, FileCheck, StickyNote,
  LogOut, Inbox, Zap, TrendingUp, ChevronDown, ChevronRight, ClipboardList, Tag, RadioTower,
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

// Sub-menu groupings for Omnichannel platforms under a single Channels hub
const CHANNELS_ITEMS: NavItem[] = [
  { href: "/dashboard/channels", icon: Settings, label: "Connect Channels" },
  { href: "/dashboard/upload", icon: Upload, label: "Upload", feature: "whatsapp" },
  { href: "/dashboard/broadcast-tags", icon: Tag, label: "Broadcast Tags", feature: "whatsapp" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates", feature: "whatsapp" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers Pool", feature: "whatsapp" },
  { href: "/dashboard/insights", icon: TrendingUp, label: "Insights", feature: "whatsapp" },
  { href: "/dashboard/audit-logs", icon: ClipboardList, label: "Audit Logs", feature: "whatsapp" },
];

const TELECALLING_ITEMS: NavItem[] = [
  { href: "/dashboard/telecalling", icon: Phone, label: "Dialer" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Call Notes" },
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
    Channels: true,
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
    if (!waEnabled) return;
    fetchCount();

    const supabase = createClient();
    const channel = supabase
      .channel("inbox-count-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_handovers",
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [waEnabled, fetchCount]);

  if (roleLoading) {
    return (
      <aside className="fixed left-0 top-0 h-full w-[220px] bg-background z-20" />
    );
  }

  // Filter items by enabled features
  const filterEnabled = (items: NavItem[]) => 
    items.filter(item => !item.feature || enabledFeatures.includes(item.feature));

  const channelsGroupItems = filterEnabled(CHANNELS_ITEMS);
  const tcGroupItems = filterEnabled(TELECALLING_ITEMS);

  const isChannelsActive = channelsGroupItems.some(item => pathname.startsWith(item.href));
  const isTcActive = tcGroupItems.some(item => pathname.startsWith(item.href));

  // Auto-expand active groups
  const showChannels = expandedGroups.Channels || isChannelsActive;
  const showTc = expandedGroups.Telecalling || isTcActive;

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-background flex flex-col z-20 select-none">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <AiraLogo size={34} />
        <div>
          <span
            className="block text-zinc-900 font-display font-bold tracking-tight leading-none text-[16px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            Aira<span className="text-zinc-500 ml-0.5 font-normal">AI</span>
          </span>
          <span
            className="block text-zinc-500 font-label uppercase"
            style={{ fontSize: "0.55rem", letterSpacing: "0.1em", marginTop: "3px" }}
          >
            Lead Intelligence
          </span>
        </div>
      </div>

      <div className="mx-5 h-px bg-zinc-300/60" />

      <div className="flex-grow overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin">
        {/* TOP LEVEL: Overview / Profile */}
        {role === "owner" ? (
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname === "/dashboard"
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <LayoutDashboard size={16} className={pathname === "/dashboard" ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Dashboard</span>
          </Link>
        ) : (
          <Link
            href="/dashboard/profile"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname === "/dashboard/profile"
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <LayoutDashboard size={16} className={pathname === "/dashboard/profile" ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>My Profile</span>
          </Link>
        )}

        {/* TOP LEVEL: Inbox (Common for all platforms) */}
        {waEnabled && (
          <Link
            href="/dashboard/inbox"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/inbox")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <Inbox size={16} className={pathname.startsWith("/dashboard/inbox") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span className="flex-grow">Inbox</span>
            {inboxCount > 0 && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold text-[9px] min-w-[16px] text-center">
                {inboxCount}
              </span>
            )}
          </Link>
        )}

        {/* TOP LEVEL: Conversations (Common for all platforms) */}
        <Link
          href="/dashboard/conversations"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
            pathname.startsWith("/dashboard/conversations")
              ? "bg-zinc-200/70 text-zinc-950"
              : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
          )}
        >
          <MessageSquare size={16} className={pathname.startsWith("/dashboard/conversations") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
          <span>Conversations</span>
        </Link>

        {/* TOP LEVEL: Leads */}
        {role === "owner" && (
          <Link
            href="/dashboard/leads"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/leads")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <Users size={16} className={pathname.startsWith("/dashboard/leads") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Leads</span>
          </Link>
        )}

        {/* TOP LEVEL: Meta Ad Leads */}
        {role === "owner" && waEnabled && (
          <Link
            href="/dashboard/ctwa-leads"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/ctwa-leads")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <RadioTower size={16} className={pathname.startsWith("/dashboard/ctwa-leads") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Meta Ad Leads</span>
          </Link>
        )}

        {/* TOP LEVEL: Knowledge Base (Common for all platforms) */}
        {role === "owner" && (
          <Link
            href="/dashboard/knowledge"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/knowledge")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <BookOpen size={16} className={pathname.startsWith("/dashboard/knowledge") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Knowledge Base</span>
          </Link>
        )}

        {/* TOP LEVEL: Automations */}
        {role === "owner" && (
          <Link
            href="/dashboard/automations"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/automations")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <Zap size={16} className={pathname.startsWith("/dashboard/automations") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Bot Flows</span>
          </Link>
        )}

        {/* TOP LEVEL: Analytics */}
        {role === "owner" && (
          <Link
            href="/dashboard/analytics"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/analytics")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <BarChart2 size={16} className={pathname.startsWith("/dashboard/analytics") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Analytics</span>
          </Link>
        )}

        {/* TOP LEVEL: Team */}
        {role === "owner" && (
          <Link
            href="/dashboard/team"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/team")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <Users size={16} className={pathname.startsWith("/dashboard/team") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Team</span>
          </Link>
        )}

        <div className="mx-2 my-3 h-px bg-zinc-200" />

        {/* GROUP: Channels messaging */}
        {role === "owner" && channelsGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("Channels")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-semibold text-left transition-all group",
                isChannelsActive ? "text-zinc-950" : "text-zinc-700 hover:bg-zinc-200/40"
              )}
            >
              <MessageSquare size={16} className={isChannelsActive ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
              <span className="flex-1">Channels</span>
              {showChannels ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            </button>

            {/* Tree items */}
            {showChannels && (
              <div className="space-y-0.5">
                {channelsGroupItems.map((item, idx) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const isLast = idx === channelsGroupItems.length - 1;

                  return (
                    <div key={item.href} className="relative pl-6 flex items-center h-9">
                      {/* Curved branch lines */}
                      <div
                        className={cn(
                          "absolute left-3 w-px bg-zinc-300/80",
                          isLast ? "top-0 h-4.5" : "-top-1 bottom-0"
                        )}
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1 w-3.5 h-3.5 border-l border-b border-zinc-300/80 rounded-bl-lg" />

                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 ml-3.5 px-3 py-1.5 w-[145px] rounded-xl text-[13px] transition-all duration-150 group",
                          active
                            ? "bg-white shadow-md border border-zinc-200/80 text-zinc-950 font-bold"
                            : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/40"
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

        {/* GROUP: Telecalling */}
        {enabledFeatures.includes("telecalling") && tcGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("Telecalling")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-semibold text-left transition-all group",
                isTcActive ? "text-zinc-950" : "text-zinc-700 hover:bg-zinc-200/40"
              )}
            >
              <Phone size={16} className={isTcActive ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
              <span className="flex-1">Telecalling</span>
              {showTc ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            </button>

            {/* Tree items */}
            {showTc && (
              <div className="space-y-0.5">
                {tcGroupItems.map((item, idx) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const isLast = idx === tcGroupItems.length - 1;

                  return (
                    <div key={item.href} className="relative pl-6 flex items-center h-9">
                      {/* Curved branch lines */}
                      <div
                        className={cn(
                          "absolute left-3 w-px bg-zinc-300/80",
                          isLast ? "top-0 h-4.5" : "-top-1 bottom-0"
                        )}
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1 w-3.5 h-3.5 border-l border-b border-zinc-300/80 rounded-bl-lg" />

                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 ml-3.5 px-3 py-1.5 w-[145px] rounded-xl text-[13px] transition-all duration-150 group",
                          active
                            ? "bg-white shadow-md border border-zinc-200/80 text-zinc-950 font-bold"
                            : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/40"
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
      </div>

      {/* Footer Actions */}
      <div className="px-3 pb-4 space-y-1.5">
        <div className="mx-2 mb-2 h-px bg-zinc-300/60" />

        {role === "owner" && (
          <Link
            href="/dashboard/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 group",
              pathname.startsWith("/dashboard/settings")
                ? "bg-zinc-200/70 text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-200/40 hover:text-zinc-950"
            )}
          >
            <Settings size={16} className={pathname.startsWith("/dashboard/settings") ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
            <span>Settings</span>
          </Link>
        )}

        {role === "owner" && (
          <div className="px-2 pt-1">
            <Link
              href="/dashboard/numbers?tab=activity"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100/85 transition-colors cursor-pointer"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="font-label text-emerald-700 font-bold tracking-wider" style={{ fontSize: "0.55rem" }}>
                ALL SYSTEMS ONLINE
              </span>
            </Link>
          </div>
        )}

        <div className="pt-2 border-t border-zinc-200/60">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
