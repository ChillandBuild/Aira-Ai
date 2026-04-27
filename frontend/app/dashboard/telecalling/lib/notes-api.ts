import { API_URL } from "@/lib/api";
import type { Note, NotesResponse } from "../types";

export async function fetchNotes(leadId: string): Promise<NotesResponse> {
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchAllNotes(leadId: string): Promise<Note[]> {
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}?limit=100`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data: NotesResponse = await res.json();
  return [...data.pinned, ...data.notes];
}

export async function saveNote(leadId: string, content: string, isPinned: boolean): Promise<Note> {
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, is_pinned: isPinned }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
