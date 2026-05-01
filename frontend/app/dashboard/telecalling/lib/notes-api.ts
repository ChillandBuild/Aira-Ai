import { API_URL, getAuthHeaders } from "@/lib/api";
import type { CallbackJob, Note, NotesResponse } from "../types";

export async function fetchNotes(leadId: string): Promise<NotesResponse> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}`, {
    headers: { "Content-Type": "application/json", ...auth },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchAllNotes(leadId: string): Promise<Note[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}?limit=100`, {
    headers: { "Content-Type": "application/json", ...auth },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data: NotesResponse = await res.json();
  return [...data.pinned, ...data.notes];
}

export async function saveNote(leadId: string, content: string, isPinned: boolean): Promise<Note> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ content, is_pinned: isPinned }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function createCallback(leadId: string, scheduledFor: string, note?: string): Promise<void> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/follow-ups/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ lead_id: leadId, scheduled_for: scheduledFor, note }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function fetchTodayCallbacks(): Promise<CallbackJob[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/follow-ups/callbacks/today`, {
    headers: { "Content-Type": "application/json", ...auth },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function markCallbackDone(jobId: string): Promise<void> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/follow-ups/callback/${jobId}/done`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function fetchTodayCompletedCallbacks(): Promise<CallbackJob[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/follow-ups/callbacks/today-completed`, {
    headers: { "Content-Type": "application/json", ...auth },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

