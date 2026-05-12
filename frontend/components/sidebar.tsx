"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Settings,
  Phone,
  BarChart2,
  Upload,
  Sparkles,
  BookOpen,
  Layers,

  FileCheck,
  StickyNote,
  LogOut,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiraLogo } from "./logo";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";

const OWNER_NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations" },
  { href: "/dashboard/leads", icon: Users, label: "Leads" },
  { href: "/dashboard/upload", icon: Upload, label: "Upload" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes" },
  { href: "/dashboard/knowledge", icon: BookOpen, label: "Knowledge" },
  { href: "/dashboard/ai-tune", icon: Sparkles, label: "AI Tune" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates" },
  { href: "/dashboard/bot-manager", icon: Bot, label: "Bot Manager" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
];

const CALLER_NAV = [
  { href: "/dashboard/profile", icon: Users, label: "My Profile" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations" },
];

const BOTTOM_NAV = [
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-2.5 w-full rounded-xl text-on-surface-muted hover:bg-surface-low hover:text-on-surface transition-colors font-label text-sm font-medium"
    >
      <LogOut size={16} />
      Sign out
    </button>
  );
}

export function Sidebar() {

  const pathname = usePathname();
  const [role, setRole] = useState<"owner" | "caller" | null>(null);

  useEffect(() => {
    api.team.me().then((me) => setRole(me.role)).catch(() => setRole("owner"));
  }, []);

  const activeNav = role === "caller" ? CALLER_NAV : OWNER_NAV;

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-white flex flex-col z-20 shadow-sidebar border-r border-border-subtle">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <AiraLogo size={36} />
        <div>
          <span
            className="block text-ink font-display font-bold tracking-tight leading-none"
            style={{ fontSize: "1.15rem", letterSpacing: "-0.03em" }}
          >
            Aira
            <span className="text-primary ml-0.5">AI</span>
          </span>
          <span
            className="block text-ink-muted font-label"
            style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}
          >
            Lead Intelligence
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-border-subtle" />

      {/* Section label */}
      <p className="px-5 pt-4 pb-1 font-label text-ink-muted" style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Workspace
      </p>

      {/* Main Nav */}
      <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
        {activeNav.map(({ href, icon: Icon, label }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group relative",
                active
                  ? "bg-surface-low text-primary font-medium"
                  : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
              )}
            >
              {/* Active left accent */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
              )}
              <Icon
                size={16}
                className={cn(
                  "transition-colors duration-150 flex-shrink-0",
                  active ? "text-primary" : "text-ink-muted group-hover:text-ink-secondary"
                )}
              />
              <span className="font-body text-sm">{label}</span>
            </Link>
          );
        })}
      </nav>


      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-0.5">
        <div className="mx-2 mb-2 h-px bg-border-subtle" />
        {role !== "caller" && BOTTOM_NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group",
                active
                  ? "bg-surface-low text-primary font-medium"
                  : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
              )}
            >
              <Icon size={16} className="flex-shrink-0 text-ink-muted group-hover:text-ink-secondary" />
              <span className="font-body text-sm">{label}</span>
            </Link>
          );
        })}
        {/* Version pill */}
        <div className="px-3 pt-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-low">
            <span className="live-dot" />
            <span className="font-label text-primary" style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.05em" }}>
              ALL SYSTEMS OPERATIONAL
            </span>
          </div>
        </div>
        {/* Logout */}
        <div className="mt-auto pt-4 border-t border-surface-mid px-0">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
