"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { BLOCK_META, PICKER_BLOCKS } from "./blockMeta";
import type { BlockType } from "./types";

interface BlockPickerProps {
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

export default function BlockPicker({ onSelect, onClose }: BlockPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 sm:p-4">
      <div
        ref={ref}
        className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface border border-surface-mid shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-surface border-b border-surface-mid">
          <h3 className="text-sm font-semibold text-on-surface">Add a block</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3 grid grid-cols-1 gap-1.5">
          {PICKER_BLOCKS.map((type) => {
            const meta = BLOCK_META[type];
            const Icon = meta.icon;
            return (
              <button
                key={type}
                onClick={() => onSelect(type)}
                className="group flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-surface-mid focus:bg-surface-mid focus:outline-none transition-colors"
              >
                <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${meta.iconBg} ${meta.iconText}`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-on-surface">{meta.label}</span>
                  <span className="block text-xs text-on-surface-muted truncate">{meta.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
