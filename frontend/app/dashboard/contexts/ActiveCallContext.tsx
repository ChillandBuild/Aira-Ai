"use client";
import { createContext, useContext, useState } from "react";
import type { ActiveCallCtx } from "../telecalling/types";

interface ActiveCallContextValue {
  activeCall: ActiveCallCtx | null;
  setActiveCall: (ctx: ActiveCallCtx | null) => void;
}

const ActiveCallContext = createContext<ActiveCallContextValue>({
  activeCall: null,
  setActiveCall: () => {},
});

export function ActiveCallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCallCtx | null>(null);
  return (
    <ActiveCallContext.Provider value={{ activeCall, setActiveCall }}>
      {children}
    </ActiveCallContext.Provider>
  );
}

export function useActiveCall() {
  return useContext(ActiveCallContext);
}
