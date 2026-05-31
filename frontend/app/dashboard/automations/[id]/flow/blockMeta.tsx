import {
  MessageSquare,
  Image as ImageIcon,
  Video,
  File as FileIcon,
  MapPin,
  MousePointerClick,
  LayoutTemplate,
  Clock,
  GitBranch,
  MessageCircleQuestion,
  ListChecks,
  Webhook,
  Dices,
  type LucideIcon,
} from "lucide-react";
import type { BlockType, BlockConfig, TriggerType } from "./types";

interface BlockMeta {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
  description: string;
}

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  send_message: {
    label: "Send Message",
    icon: MessageSquare,
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-600",
    description: "A plain text message",
  },
  send_image: {
    label: "Send Image",
    icon: ImageIcon,
    iconBg: "bg-blue-100",
    iconText: "text-blue-600",
    description: "An image with optional caption",
  },
  send_video: {
    label: "Send Video",
    icon: Video,
    iconBg: "bg-violet-100",
    iconText: "text-violet-600",
    description: "A video with optional caption",
  },
  send_file: {
    label: "Send File",
    icon: FileIcon,
    iconBg: "bg-amber-100",
    iconText: "text-amber-600",
    description: "A document attachment",
  },
  send_location: {
    label: "Send Location",
    icon: MapPin,
    iconBg: "bg-rose-100",
    iconText: "text-rose-600",
    description: "A pin on the map",
  },
  cta_url: {
    label: "Button (URL)",
    icon: MousePointerClick,
    iconBg: "bg-indigo-100",
    iconText: "text-indigo-600",
    description: "Message with a tappable link button",
  },
  send_template: {
    label: "Send Template",
    icon: LayoutTemplate,
    iconBg: "bg-cyan-100",
    iconText: "text-cyan-600",
    description: "An approved WhatsApp template",
  },
  wait: {
    label: "Delay",
    icon: Clock,
    iconBg: "bg-zinc-100",
    iconText: "text-zinc-500",
    description: "Pause before the next step",
  },
  condition: {
    label: "Condition",
    icon: GitBranch,
    iconBg: "bg-orange-100",
    iconText: "text-orange-600",
    description: "Split the flow on lead data",
  },
  user_input: {
    label: "Ask a Question",
    icon: MessageCircleQuestion,
    iconBg: "bg-teal-100",
    iconText: "text-teal-600",
    description: "Prompt the lead and save their reply",
  },
  interactive: {
    label: "Button Menu",
    icon: ListChecks,
    iconBg: "bg-fuchsia-100",
    iconText: "text-fuchsia-600",
    description: "Up to 3 buttons, one branch each",
  },
  http_api: {
    label: "Call an API",
    icon: Webhook,
    iconBg: "bg-sky-100",
    iconText: "text-sky-600",
    description: "Fetch data from an external service",
  },
  random: {
    label: "Random Number",
    icon: Dices,
    iconBg: "bg-lime-100",
    iconText: "text-lime-600",
    description: "Pick a number in a range",
  },
};

// Order shown in the block picker.
export const PICKER_BLOCKS: BlockType[] = [
  "send_message",
  "send_image",
  "send_video",
  "send_file",
  "send_location",
  "cta_url",
  "send_template",
  "wait",
  "condition",
  "user_input",
  "interactive",
  "http_api",
  "random",
];

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  lead_created: "Lead Created",
  first_inbound_message: "First Inbound Message",
  new_message_received: "Message Received",
  keyword_match: "Keyword Match",
  segment_changed: "Segment Changed",
  score_threshold: "Score Threshold",
};

export const TRIGGER_COLORS: Record<TriggerType, string> = {
  lead_created: "bg-emerald-100 text-emerald-700",
  first_inbound_message: "bg-blue-100 text-blue-700",
  new_message_received: "bg-violet-100 text-violet-700",
  keyword_match: "bg-amber-100 text-amber-700",
  segment_changed: "bg-pink-100 text-pink-700",
  score_threshold: "bg-orange-100 text-orange-700",
};

const SEGMENT_LABELS: Record<string, string> = {
  A: "Hot (A)",
  B: "Warm (B)",
  C: "Cold (C)",
  D: "Disqualified (D)",
};

const SUBJECT_LABELS: Record<string, string> = {
  segment: "Segment",
  score: "Score",
  channel: "Channel",
  message_content: "Message",
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "is",
  not_equals: "is not",
  gte: "≥",
  lte: "≤",
  eq: "=",
  contains: "contains",
  not_contains: "doesn't contain",
};

function truncate(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// One-line human summary of a block's config for the card body.
export function blockSummary(type: BlockType, config: BlockConfig): string {
  switch (type) {
    case "send_message":
      return config.message ? truncate(config.message) : "No message yet";
    case "send_image":
      return config.url ? config.caption || "Image" : "No image URL yet";
    case "send_video":
      return config.url ? config.caption || "Video" : "No video URL yet";
    case "send_file":
      return config.filename || config.url || "No file yet";
    case "send_location":
      return config.name || config.address || (config.latitude != null ? `${config.latitude}, ${config.longitude}` : "No location yet");
    case "cta_url":
      return config.button_text ? `${config.button_text} → ${truncate(config.button_url || "", 30)}` : "No button yet";
    case "send_template":
      return config.template_name || "No template selected";
    case "wait": {
      if (!config.amount) return "Set a delay";
      const unit = config.unit || "minutes";
      return `Wait ${config.amount} ${config.amount === 1 ? unit.slice(0, -1) : unit}`;
    }
    case "condition": {
      const subj = SUBJECT_LABELS[config.subject || ""] || "Field";
      if (!config.operator) return "Set a condition";
      const op = OPERATOR_LABELS[config.operator] || config.operator;
      const val = config.subject === "segment" ? SEGMENT_LABELS[config.value || ""] || config.value : config.value;
      return `${subj} ${op} ${val || "…"}`;
    }
    case "user_input":
      return config.prompt ? truncate(config.prompt) : "No question yet";
    case "interactive": {
      const count = config.buttons?.length || 0;
      if (!config.body) return "No message yet";
      return `${truncate(config.body, 40)} · ${count} button${count === 1 ? "" : "s"}`;
    }
    case "http_api":
      return config.url ? `${config.method || "GET"} ${truncate(config.url, 44)}` : "No URL yet";
    case "random":
      return config.save_as
        ? `${config.min ?? 0}–${config.max ?? 0} → {{${config.save_as}}}`
        : `${config.min ?? 0}–${config.max ?? 0}`;
    default:
      return "";
  }
}

// Stable, collision-resistant id for an interactive button. Stored on the
// button object so its child branch lane stays linked across edits.
export function newButtonId(): string {
  return `btn_${Math.random().toString(36).slice(2, 9)}`;
}

// Default config when a block is added.
export function defaultConfig(type: BlockType): BlockConfig {
  switch (type) {
    case "send_message":
      return { message: "" };
    case "send_image":
    case "send_video":
      return { url: "", caption: "" };
    case "send_file":
      return { url: "", filename: "", caption: "" };
    case "send_location":
      return { latitude: 0, longitude: 0, name: "", address: "" };
    case "cta_url":
      return { body: "", button_text: "", button_url: "" };
    case "send_template":
      return { template_name: "", language_code: "en", params: [] };
    case "wait":
      return { amount: 1, unit: "hours" };
    case "condition":
      return { subject: "segment", operator: "equals", value: "A" };
    case "user_input":
      return { prompt: "", save_as: "" };
    case "interactive":
      return {
        body: "",
        buttons: [{ id: newButtonId(), title: "" }],
        save_as: "",
      };
    case "http_api":
      return { method: "GET", url: "", headers: {}, body: "", save_as: "", json_path: "" };
    case "random":
      return { min: 1, max: 100, save_as: "" };
    default:
      return {};
  }
}
