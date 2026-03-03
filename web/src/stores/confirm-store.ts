import { create } from 'zustand';

interface ConfirmState {
  open: boolean;
  message: string;
  resolve: ((value: boolean) => void) | null;
  show: (message: string) => Promise<boolean>;
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  message: '',
  resolve: null,

  show: (message) => {
    return new Promise<boolean>((resolve) => {
      set({ open: true, message, resolve });
    });
  },

  close: (result) => {
    const { resolve } = get();
    resolve?.(result);
    set({ open: false, message: '', resolve: null });
  },
}));

/**
 * Hook that returns a confirm function.
 * Usage: const confirm = useConfirm(); if (await confirm('Sure?')) { ... }
 */
export function useConfirm() {
  return useConfirmStore((s) => s.show);
}
