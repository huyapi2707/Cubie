import { create } from 'zustand';

export type PopupType = 'error' | 'warning' | 'info';

export interface PopupItem {
  id: string;
  type: PopupType;
  message: string;
  title?: string;
  duration?: number;
}

interface PopupState {
  popups: PopupItem[];
  showPopup: (popup: Omit<PopupItem, 'id'>) => void;
  removePopup: (id: string) => void;
}

export const usePopupStore = create<PopupState>((set) => ({
  popups: [],
  showPopup: (popup) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({ popups: [...state.popups, { ...popup, id }] }));
    
    // Auto remove unless duration is 0
    if (popup.duration !== 0) {
      setTimeout(() => {
        set((state) => ({ popups: state.popups.filter((p) => p.id !== id) }));
      }, popup.duration || 4000);
    }
  },
  removePopup: (id) =>
    set((state) => ({ popups: state.popups.filter((p) => p.id !== id) })),
}));
