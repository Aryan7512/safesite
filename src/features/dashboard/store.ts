import { create } from 'zustand';
import type { Filters } from '@/domain/metrics';

/** Breakpoint for the laptop / projector layout (sidebar, two columns, drawer). */
export const WIDE = 900;

interface DashState extends Filters {
  /** Report open in the right-hand drawer (wide screens). */
  drawerId: number | null;
  setShift: (s: Filters['shift']) => void;
  setWindow: (w: Filters['window']) => void;
  open: (id: number) => void;
  close: () => void;
}

export const useDash = create<DashState>((set) => ({
  shift: 'All',
  window: '30d',
  drawerId: null,
  setShift: (shift) => set({ shift }),
  setWindow: (window) => set({ window }),
  open: (drawerId) => set({ drawerId }),
  close: () => set({ drawerId: null }),
}));
