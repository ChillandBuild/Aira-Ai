// Shared types for the Bot Flow builder.

export type BlockType =
  | "send_message"
  | "send_image"
  | "send_video"
  | "send_file"
  | "send_location"
  | "cta_url"
  | "send_template"
  | "wait"
  | "condition"
  | "user_input"
  | "interactive"
  | "http_api"
  | "random"
  | "ai_agent"
  // BotBiz blocks
  | "send_audio"
  | "send_list"
  | "add_label"
  | "send_catalog";

// Block types that fan the flow out into multiple labeled lanes.
export const BRANCHING_TYPES: readonly BlockType[] = ["condition", "interactive", "ai_agent"];

export function isBranching(type: BlockType): boolean {
  return BRANCHING_TYPES.includes(type);
}

export type TriggerType =
  | "lead_created"
  | "first_inbound_message"
  | "new_message_received"
  | "keyword_match"
  | "segment_changed"
  | "score_threshold";

// A branch label. For condition: "yes" | "no". For interactive: a button id.
// Null = the root lane (no parent branch).
export type Branch = string | null;

export type WaitUnit = "minutes" | "hours" | "days";

export type ConditionSubject = "segment" | "score" | "channel" | "message_content";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// A single interactive reply button. `id` is stable across edits and is used
// as the branch label that links a button to its child lane.
export interface InteractiveButton {
  id: string;
  title: string;
}

// Per-block config — discriminated by step_type at the form layer.
export interface BlockConfig {
  // send_message
  message?: string;
  // send_image / send_video / send_file / cta_url media
  url?: string;
  caption?: string;
  filename?: string;
  // send_location
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  // cta_url
  body?: string;
  button_text?: string;
  button_url?: string;
  // send_template
  template_name?: string;
  language_code?: string;
  params?: string[];
  // wait
  amount?: number;
  unit?: WaitUnit;
  // condition
  subject?: ConditionSubject;
  operator?: string;
  value?: string;
  // user_input
  prompt?: string;
  save_as?: string;
  // interactive
  buttons?: InteractiveButton[];
  // http_api
  method?: HttpMethod;
  headers?: Record<string, string>;
  json_path?: string;
  // random
  min?: number;
  max?: number;
  // ai_agent
  goal?: string;
  outcomes?: string[];
  output_var?: string;
  tools?: string[];
  max_turns?: number;
  use_knowledge?: boolean;
  // send_list
  sections?: ListSection[];
  header?: string;
  footer?: string;
  // user_input multiple choice
  mode?: "text" | "multiple_choice";
  choices?: string[];
  // condition multi-condition
  conditions?: SingleCondition[];
  condition_mode?: "all" | "any";
  // add_label
  tag_id?: string;
  action?: "add" | "remove";
  // send_catalog
  catalog_id?: string;
  section_title?: string;
  product_ids?: string[];
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface SingleCondition {
  subject: ConditionSubject;
  operator: string;
  value: string;
}

export interface TriggerConfig {
  keywords?: string[];
  to_segment?: "A" | "B" | "C" | "D";
  threshold?: number;
  match_type?: "any" | "all";
  match_mode?: "contains" | "exact";
}

// A flat step row as returned by the backend.
export interface Step {
  id: string;
  step_type: BlockType;
  config: BlockConfig;
  parent_step_id: string | null;
  branch: Branch;
  position: number;
  sent_count: number;
  delivered_count: number;
  error_count: number;
}

// Shape sent to the backend on save.
export interface StepIn {
  id?: string;
  step_type: BlockType;
  config: BlockConfig;
  parent_step_id: string | null;
  branch: Branch;
  position: number;
}

// In-memory tree node. `branches` maps a branch label to its child lane.
// Leaf nodes carry an empty map. Condition uses keys "yes"/"no"; interactive
// uses button ids as keys.
export interface FlowNode {
  id: string;
  step_type: BlockType;
  config: BlockConfig;
  sent_count: number;
  delivered_count: number;
  error_count: number;
  branches: Record<string, FlowNode[]>;
}

// A rendered lane: derived from a node's config (not its branches map keys),
// so empty lanes still show and order/labels track config.
export interface LaneSpec {
  key: string;
  label: string;
}

// Derive the ordered lanes a branching node should render. Children for a lane
// are looked up by key in node.branches; this never reads the map's own keys so
// empty lanes still appear and renames re-label without re-linking.
export function lanesOf(node: FlowNode): LaneSpec[] {
  if (node.step_type === "condition") {
    return [
      { key: "yes", label: "if yes" },
      { key: "no", label: "if no" },
    ];
  }
  if (node.step_type === "interactive") {
    return (node.config.buttons || []).map((b, i) => ({
      key: b.id,
      label: b.title.trim() || `Button ${i + 1}`,
    }));
  }
  if (node.step_type === "ai_agent") {
    // Each declared outcome is a branch lane; the outcome string is the branch key.
    return (node.config.outcomes || []).map((o, i) => ({
      key: o,
      label: o.trim() || `Outcome ${i + 1}`,
    }));
  }
  return [];
}

// Flow list item.
export interface FlowListItem {
  id: string;
  name: string;
  trigger_type: TriggerType;
  active: boolean;
  run_count: number;
  subscriber_count: number;
  created_at: string;
}

// Full flow detail.
export interface FlowDetail extends FlowListItem {
  trigger_config: TriggerConfig;
  steps: Step[];
}

// Where to insert a new block.
export interface InsertTarget {
  parentId: string | null;
  branch: Branch;
  position: number;
}
