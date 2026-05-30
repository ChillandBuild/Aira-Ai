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
  | "condition";

export type TriggerType =
  | "lead_created"
  | "first_inbound_message"
  | "new_message_received"
  | "keyword_match"
  | "segment_changed"
  | "score_threshold";

export type Branch = "yes" | "no" | null;

export type WaitUnit = "minutes" | "hours" | "days";

export type ConditionSubject = "segment" | "score" | "channel" | "message_content";

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
}

export interface TriggerConfig {
  keywords?: string[];
  to_segment?: "A" | "B" | "C" | "D";
  threshold?: number;
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

// In-memory tree node. Children only populated for `condition` blocks.
export interface FlowNode {
  id: string;
  step_type: BlockType;
  config: BlockConfig;
  sent_count: number;
  delivered_count: number;
  error_count: number;
  yes: FlowNode[];
  no: FlowNode[];
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
