"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BLOCK_META } from "../blockMeta";
import type { BlockConfig, FlowNode } from "../types";
import {
  TextForm,
  MediaForm,
  FileForm,
  LocationForm,
  CtaForm,
  TemplateForm,
  WaitForm,
  ConditionForm,
  UserInputForm,
  InteractiveForm,
  HttpApiForm,
  RandomForm,
  AgentForm,
  AudioForm,
  ListMenuForm,
  AddLabelForm,
  CatalogForm,
} from "./forms";

interface BlockConfigDrawerProps {
  node: FlowNode;
  onSave: (config: BlockConfig) => void;
  onClose: () => void;
}

export default function BlockConfigDrawer({ node, onSave, onClose }: BlockConfigDrawerProps) {
  const [config, setConfig] = useState<BlockConfig>(node.config);
  const meta = BLOCK_META[node.step_type];
  const Icon = meta.icon;

  useEffect(() => {
    setConfig(node.config);
  }, [node]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (next: Partial<BlockConfig>) => setConfig((c) => ({ ...c, ...next }));

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const renderForm = () => {
    switch (node.step_type) {
      case "send_message":
        return <TextForm config={config} patch={patch} />;
      case "send_image":
        return <MediaForm config={config} patch={patch} kind="image" />;
      case "send_video":
        return <MediaForm config={config} patch={patch} kind="video" />;
      case "send_file":
        return <FileForm config={config} patch={patch} />;
      case "send_location":
        return <LocationForm config={config} patch={patch} />;
      case "cta_url":
        return <CtaForm config={config} patch={patch} />;
      case "send_template":
        return <TemplateForm config={config} patch={patch} />;
      case "wait":
        return <WaitForm config={config} patch={patch} />;
      case "condition":
        return <ConditionForm config={config} patch={patch} />;
      case "user_input":
        return <UserInputForm config={config} patch={patch} />;
      case "interactive":
        return <InteractiveForm config={config} patch={patch} />;
      case "http_api":
        return <HttpApiForm config={config} patch={patch} />;
      case "random":
        return <RandomForm config={config} patch={patch} />;
      case "ai_agent":
        return <AgentForm config={config} patch={patch} />;
      case "send_audio":
        return <AudioForm config={config} patch={patch} />;
      case "send_list":
        return <ListMenuForm config={config} patch={patch} />;
      case "add_label":
        return <AddLabelForm config={config} patch={patch} />;
      case "send_catalog":
        return <CatalogForm config={config} patch={patch} />;
      default:
        return null;
    }
  };

  const content = (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-md h-full max-h-screen flex flex-col bg-surface border-l border-surface-mid shadow-2xl rounded-t-3xl sm:rounded-none mt-auto sm:mt-0 sm:h-full animate-in slide-in-from-bottom sm:slide-in-from-right">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-mid">
          <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${meta.iconBg} ${meta.iconText}`}>
            <Icon size={17} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-on-surface">{meta.label}</h3>
            <p className="text-xs text-on-surface-muted truncate">{meta.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">{renderForm()}</div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-surface-mid">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-on-surface-muted hover:bg-surface-mid transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
