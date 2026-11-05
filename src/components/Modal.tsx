import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export default function Modal({ open, title, icon, onClose, children, footer, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cocoa/40 p-4 backdrop-blur-sm"
      data-no-touch
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card-storybook flex max-h-[90dvh] w-full animate-pop-in flex-col bg-cream/95 ${wide ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <header className="flex items-center gap-3 border-b-4 border-white px-6 py-4">
          {icon && <span className="text-blush">{icon}</span>}
          <h2 className="flex-1 font-cute text-2xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white p-2 shadow-soft transition hover:bg-peach/50 active:scale-90"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="border-t-4 border-white px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
