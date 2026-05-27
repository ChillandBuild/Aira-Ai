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
  Send as TelegramIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiraLogo } from "./logo";
import { createClient } from "@/lib/supabase/client";

function Instagram({ size = 16, className, color = "currentColor", strokeWidth = 2 }: { size?: number | string; className?: string; color?: string; strokeWidth?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function Facebook({ size = 16, className, color = "currentColor", strokeWidth = 2 }: { size?: number | string; className?: string; color?: string; strokeWidth?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  feature?: string;
  badgeType?: "inbox" | "scheduled" | "drafts";
};

// Sub-menu groupings for Omnichannel platforms
const WHATSAPP_ITEMS: NavItem[] = [
  { href: "/dashboard/upload", icon: Upload, label: "Upload" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers Pool" },
  { href: "/dashboard/insights", icon: TrendingUp, label: "Insights" },
  { href: "/dashboard/whatsapp/connect", icon: Settings, label: "Connect Account" },
];

const INSTAGRAM_ITEMS: NavItem[] = [
  { href: "/dashboard/instagram/connect", icon: Settings, label: "Connect Account", feature: "instagram" },
];

const FACEBOOK_ITEMS: NavItem[] = [
  { href: "/dashboard/facebook/connect", icon: Settings, label: "Connect Account", feature: "facebook" },
];

const TELEGRAM_ITEMS: NavItem[] = [
  { href: "/dashboard/telegram/connect", icon: Settings, label: "Connect Account", feature: "telegram" },
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
    WhatsApp: true,
    Instagram: false,
    Facebook: false,
    Telegram: false,
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
      <aside className="fixed left-0 top-0 h-full w-[220px] bg-background z-20" />
    );
  }

  // Filter items by enabled features
  const filterEnabled = (items: NavItem[]) => 
    items.filter(item => !item.feature || enabledFeatures.includes(item.feature));

  const waGroupItems = filterEnabled(WHATSAPP_ITEMS);
  const igGroupItems = filterEnabled(INSTAGRAM_ITEMS);
  const fbGroupItems = filterEnabled(FACEBOOK_ITEMS);
  const tgGroupItems = filterEnabled(TELEGRAM_ITEMS);
  const tcGroupItems = filterEnabled(TELECALLING_ITEMS);

  const isWaActive = waGroupItems.some(item => pathname.startsWith(item.href));
  const isIgActive = igGroupItems.some(item => pathname.startsWith(item.href));
  const isFbActive = fbGroupItems.some(item => pathname.startsWith(item.href));
  const isTgActive = tgGroupItems.some(item => pathname.startsWith(item.href));
  const isTcActive = tcGroupItems.some(item => pathname.startsWith(item.href));

  // Auto-expand active groups
  const showWa = expandedGroups.WhatsApp || isWaActive;
  const showIg = expandedGroups.Instagram || isIgActive;
  const showFb = expandedGroups.Facebook || isFbActive;
  const showTg = expandedGroups.Telegram || isTgActive;
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
        {/* TOP LEVEL: Overview */}
        {role === "owner" && (
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

        {/* TOP LEVEL: Knowledge Base (Common for all platforms) */}
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
            <span>Automations</span>
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

        {/* GROUP: WhatsApp messaging */}
        {enabledFeatures.includes("whatsapp") && waGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("WhatsApp")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-semibold text-left transition-all group",
                isWaActive ? "text-zinc-950" : "text-zinc-700 hover:bg-zinc-200/40"
              )}
            >
              <MessageSquare size={16} className={isWaActive ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
              <span className="flex-1">WhatsApp</span>
              {showWa ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            </button>

            {/* Tree items */}
            {showWa && (
              <div className="space-y-0.5">
                {waGroupItems.map((item, idx) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const isLast = idx === waGroupItems.length - 1;

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

        {/* GROUP: Instagram messaging */}
        {enabledFeatures.includes("instagram") && igGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("Instagram")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-semibold text-left transition-all group",
                isIgActive ? "text-zinc-950" : "text-zinc-700 hover:bg-zinc-200/40"
              )}
            >
              <Instagram size={16} className={isIgActive ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
              <span className="flex-1">Instagram</span>
              {showIg ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            </button>

            {/* Tree items */}
            {showIg && (
              <div className="space-y-0.5">
                {igGroupItems.map((item, idx) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const isLast = idx === igGroupItems.length - 1;

                  return (
                    <div key={item.href} className="relative pl-6 flex items-center h-9">
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

        {/* GROUP: Facebook messaging */}
        {enabledFeatures.includes("facebook") && fbGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("Facebook")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-semibold text-left transition-all group",
                isFbActive ? "text-zinc-950" : "text-zinc-700 hover:bg-zinc-200/40"
              )}
            >
              <Facebook size={16} className={isFbActive ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
              <span className="flex-1">Facebook</span>
              {showFb ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            </button>

            {/* Tree items */}
            {showFb && (
              <div className="space-y-0.5">
                {fbGroupItems.map((item, idx) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const isLast = idx === fbGroupItems.length - 1;

                  return (
                    <div key={item.href} className="relative pl-6 flex items-center h-9">
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

        {/* GROUP: Telegram messaging */}
        {enabledFeatures.includes("telegram") && tgGroupItems.length > 0 && (
          <div className="space-y-0.5">
            <button
              onClick={() => toggleGroup("Telegram")}
              className={cn(
                "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-semibold text-left transition-all group",
                isTgActive ? "text-zinc-950" : "text-zinc-700 hover:bg-zinc-200/40"
              )}
            >
              <TelegramIcon size={16} className={isTgActive ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-700"} />
              <span className="flex-1">Telegram</span>
              {showTg ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            </button>

            {/* Tree items */}
            {showTg && (
              <div className="space-y-0.5">
                {tgGroupItems.map((item, idx) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const isLast = idx === tgGroupItems.length - 1;

                  return (
                    <div key={item.href} className="relative pl-6 flex items-center h-9">
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

        <div className="px-2 pt-1">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="font-label text-emerald-700 font-bold tracking-wider" style={{ fontSize: "0.55rem" }}>
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
