"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";
import {
  LayoutDashboard, MessageSquare, Users, Settings, Phone,
  BarChart2, Upload, BookOpen, Layers, FileCheck, StickyNote,
  LogOut, BookOpenCheck, ShieldCheck,
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
  { href: "/dashboard/leads", icon: Users, label: "Leads" },
  { href: "/dashboard/upload", icon: Upload, label: "Upload", feature: "whatsapp" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling", feature: "telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes", feature: "telecalling" },
  { href: "/dashboard/knowledge", icon: BookOpen, label: "Knowledge", feature: "whatsapp" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers", feature: "telecalling" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates", feature: "whatsapp" },
  { href: "/dashboard/bookings", icon: BookOpenCheck, label: "Bookings" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
];

const CALLER_NAV: NavItem[] = [
  { href: "/dashboard/profile", icon: Users, label: "My Profile" },
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
  const { role, enabledFeatures, isSystemAdmin, loading: roleLoading } = useAuthRole();

  if (roleLoading) {
    return (
      <aside className="fixed left-0 top-0 h-full w-[220px] bg-white z-20 shadow-sidebar border-r border-border-subtle" />
    );
  }

  const baseNav = role === "caller" ? CALLER_NAV : OWNER_NAV;
  const activeNav = baseNav.filter(
    (item) => !item.feature || enabledFeatures.includes(item.feature)
  );

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
            Aira<span className="text-primary ml-0.5">AI</span>
          </span>
          <span
            className="block text-ink-muted font-label"
            style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}
          >
            Lead Intelligence
          </span>
        </div>
      </div>

      <div className="mx-5 h-px bg-border-subtle" />

      <p className="px-5 pt-4 pb-1 font-label text-ink-muted" style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Workspace
      </p>

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

        {isSystemAdmin && (
          <Link
            href="/operator"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group",
              pathname.startsWith("/operator")
                ? "bg-surface-low text-primary font-medium"
                : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
            )}
          >
            <ShieldCheck size={16} className="flex-shrink-0 text-ink-muted group-hover:text-ink-secondary" />
            <span className="font-body text-sm">Operator</span>
          </Link>
        )}

        <div className="px-3 pt-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-low">
            <span className="live-dot" />
            <span className="font-label text-primary" style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.05em" }}>
              ALL SYSTEMS OPERATIONAL
            </span>
          </div>
        </div>
        <div className="mt-auto pt-4 border-t border-surface-mid px-0">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
