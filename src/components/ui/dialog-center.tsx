'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

type DialogState =
  | {
      type: 'confirm';
      title: string;
      description: string;
      confirmText: string;
      cancelText: string;
      danger: boolean;
    }
  | {
      type: 'prompt';
      title: string;
      description: string;
      placeholder: string;
      confirmText: string;
      cancelText: string;
      value: string;
    }
  | null;

interface DialogContextValue {
  notify: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const resolverRef = useRef<((value: boolean | string | null) => void) | null>(null);

  const notify = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const safeResolve = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      resolverRef.current = (value) => safeResolve(Boolean(value));
      setDialog({
        type: 'confirm',
        title: options.title,
        description: options.description || '',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        danger: options.danger ?? false,
      });
      window.setTimeout(() => {
        if (settled) return;
        const mounted = document.querySelector('[data-dialog-center="confirm"]');
        if (!mounted) {
          console.warn('[DialogCenter] confirm fallback: custom dialog not mounted in time');
          resolverRef.current = null;
          safeResolve(window.confirm(options.description || options.title));
        }
      }, 120);
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const safeResolve = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      resolverRef.current = (value) => safeResolve(typeof value === 'string' ? value : null);
      setDialog({
        type: 'prompt',
        title: options.title,
        description: options.description || '',
        placeholder: options.placeholder || '',
        value: options.defaultValue || '',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
      });
      window.setTimeout(() => {
        if (settled) return;
        const mounted = document.querySelector('[data-dialog-center="prompt"]');
        if (!mounted) {
          console.warn('[DialogCenter] prompt fallback: custom dialog not mounted in time');
          resolverRef.current = null;
          const nativeValue = window.prompt(options.description || options.title, options.defaultValue || '');
          safeResolve(nativeValue && nativeValue.trim() ? nativeValue.trim() : null);
        }
      }, 120);
    });
  }, []);

  const closeConfirm = useCallback((confirmed: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(confirmed);
  }, []);

  const closePrompt = useCallback((submit: boolean) => {
    const resolver = resolverRef.current;
    if (!resolver) {
      setDialog(null);
      return;
    }
    if (submit && dialog?.type === 'prompt') {
      resolver(dialog.value.trim() || null);
    } else {
      resolver(null);
    }
    resolverRef.current = null;
    setDialog(null);
  }, [dialog]);

  const value = useMemo<DialogContextValue>(() => ({ notify, confirm, prompt }), [notify, confirm, prompt]);

  return (
    <DialogContext.Provider value={value}>
      {children}

      <div className="fixed right-6 top-20 z-[130] space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="modern-popover min-w-[240px] max-w-[320px] px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              {toast.type === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />}
              {toast.type === 'error' && <XCircle className="mt-0.5 h-4 w-4 text-red-600" />}
              {toast.type === 'info' && <Info className="mt-0.5 h-4 w-4 text-sky-600" />}
              <p className="theme-title text-sm leading-5">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>

      {dialog && (
        <div
          className="modern-overlay z-[140]"
          data-dialog-center={dialog.type}
          onClick={() => (dialog.type === 'confirm' ? closeConfirm(false) : closePrompt(false))}
        >
          <div className="modern-modal w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${dialog.type === 'confirm' && dialog.danger ? 'bg-red-100 text-red-600' : 'bg-sky-100 text-sky-700'}`}>
                {dialog.type === 'confirm' && dialog.danger ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="theme-title text-base font-semibold">{dialog.title}</p>
                {dialog.description && <p className="theme-muted mt-1 text-sm">{dialog.description}</p>}
              </div>
              <button type="button" onClick={() => (dialog.type === 'confirm' ? closeConfirm(false) : closePrompt(false))} className="button-secondary rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>

            {dialog.type === 'prompt' && (
              <div className="mt-4">
                <input
                  autoFocus
                  value={dialog.value}
                  onChange={(e) => setDialog((prev) => (prev && prev.type === 'prompt' ? { ...prev, value: e.target.value } : prev))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') closePrompt(true);
                  }}
                  placeholder={dialog.placeholder}
                  className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => (dialog.type === 'confirm' ? closeConfirm(false) : closePrompt(false))}
                className="button-secondary rounded-lg px-3 py-2 text-sm"
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                onClick={() => (dialog.type === 'confirm' ? closeConfirm(true) : closePrompt(true))}
                className={`rounded-lg px-3 py-2 text-sm text-white ${dialog.type === 'confirm' && dialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return ctx;
}
