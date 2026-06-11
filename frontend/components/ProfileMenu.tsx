"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";
import { useLogout } from "@/hooks/useLogout";

export function ProfileMenu() {
  const { role } = useAuthRole();
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
    };
    loadUser();
  }, []);

  const roleLabel = role === "owner" ? "Admin" : role === "caller" ? "Telecaller" : "";

  const logout = useLogout();

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 transition-all">
        <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><User size={14} /></span>
        <span className="text-xs font-bold text-slate-700 hidden sm:block">{roleLabel}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200/80 rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-800 truncate">{email || "Account"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{roleLabel}</p>
            </div>
            <button onClick={() => { setOpen(false); router.push("/dashboard/profile"); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left"><User size={15} /> Profile</button>
            <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 text-left"><LogOut size={15} /> Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}
