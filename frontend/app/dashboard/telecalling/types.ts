export type Note = {
  id: string;
  lead_id: string;
  caller_id: string | null;
  call_log_id: string | null;
  content: string;
  structured: {
    course?: string;
    budget?: string;
    timeline?: string;
    next_action?: string;
    sentiment?: string;
  };
  is_pinned: boolean;
  tags?: string[];
  created_at: string;
};

export type NotesResponse = {
  pinned: Note[];
  notes: Note[];
};

export type ActiveCallCtx = {
  leadId: string | null;
  name: string | null;
  phone: string | null;
};
