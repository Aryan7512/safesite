import { create } from 'zustand';
import type { AssistantProposal } from '@/lib/api';

export interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  proposals?: (AssistantProposal & { state?: 'applied' | 'dismissed' | 'failed'; error?: string })[];
}

interface AssistantState {
  open: boolean;
  messages: ChatMsg[];
  busy: boolean;
  briefing: { bullets: string[]; at: number } | null;
  briefingState: 'idle' | 'loading' | 'error';
  setOpen: (o: boolean) => void;
  push: (m: Omit<ChatMsg, 'id'>) => number;
  patchProposal: (msgId: number, reportId: number, type: string, patch: { state?: 'applied' | 'dismissed' | 'failed'; error?: string }) => void;
  setBusy: (b: boolean) => void;
  setBriefing: (b: { bullets: string[]; at: number } | null, st?: 'idle' | 'loading' | 'error') => void;
  clear: () => void;
}

let next = 1;
export const useAssistant = create<AssistantState>((set) => ({
  open: false,
  messages: [],
  busy: false,
  briefing: null,
  briefingState: 'idle',
  setOpen: (open) => set({ open }),
  push: (m) => {
    const id = next++;
    set((s) => ({ messages: [...s.messages, { ...m, id }] }));
    return id;
  },
  patchProposal: (msgId, reportId, type, patch) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === msgId ? { ...m, proposals: m.proposals?.map((p) => (p.report_id === reportId && p.type === type ? { ...p, ...patch } : p)) } : m,
      ),
    })),
  setBusy: (busy) => set({ busy }),
  setBriefing: (briefing, st) => set({ briefing, briefingState: st ?? 'idle' }),
  clear: () => set({ messages: [], briefing: null, briefingState: 'idle' }),
}));
