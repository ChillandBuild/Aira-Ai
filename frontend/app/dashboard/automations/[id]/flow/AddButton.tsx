"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import BlockPicker from "./BlockPicker";
import type { BlockType, InsertTarget } from "./types";

interface AddButtonProps {
  target: InsertTarget;
  onAdd: (type: BlockType, target: InsertTarget) => void;
  variant?: "inline" | "first";
  firstLabel?: string;
}

export default function AddButton({ target, onAdd, variant = "inline", firstLabel }: AddButtonProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (type: BlockType) => {
    onAdd(type, target);
    setOpen(false);
  };

  if (variant === "first") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-surface-mid text-sm font-medium text-on-surface-muted hover:border-primary/40 hover:text-on-surface hover:bg-surface-low transition-colors"
        >
          <Plus size={16} />
          {firstLabel || "Add first block"}
        </button>
        {open && <BlockPicker onSelect={handleSelect} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="group relative flex items-center justify-center h-7">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-surface-mid" aria-hidden />
        <button
          onClick={() => setOpen(true)}
          className="relative z-10 w-6 h-6 rounded-full flex items-center justify-center bg-surface border border-surface-mid text-on-surface-muted opacity-60 hover:opacity-100 hover:border-primary/50 hover:text-primary hover:scale-110 transition-all"
          aria-label="Add block here"
        >
          <Plus size={13} />
        </button>
      </div>
      {open && <BlockPicker onSelect={handleSelect} onClose={() => setOpen(false)} />}
    </>
  );
}
