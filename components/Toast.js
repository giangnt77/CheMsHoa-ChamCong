'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    setToasts((prev) => {
      // Chống duplicate: Nếu đã có toast cùng title & message thì không add trùng
      const isDuplicate = prev.some(
        (t) => t.title === toast.title && t.message === toast.message && !t.leaving
      );
      if (isDuplicate) return prev;

      const id = Date.now() + Math.random();
      setTimeout(() => {
        setToasts((p) => p.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        setTimeout(() => {
          setToasts((p) => p.filter((t) => t.id !== id));
        }, 300);
      }, 3000);

      return [...prev, { ...toast, id }];
    });
  }, []);

  const success = useCallback((title, message) => {
    addToast({ type: 'success', title, message });
  }, [addToast]);

  const error = useCallback((title, message) => {
    addToast({ type: 'error', title, message });
  }, [addToast]);

  const warning = useCallback((title, message) => {
    addToast({ type: 'warning', title, message });
  }, [addToast]);

  const info = useCallback((title, message) => {
    addToast({ type: 'info', title, message });
  }, [addToast]);

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const borderColors = {
    success: 'border-l-emerald-500',
    error: 'border-l-[var(--color-coral-500)]',
    warning: 'border-l-amber-500',
    info: 'border-l-sky-500',
  };

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-5 right-5 z-[2000] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              bg-[#12121e] border border-[var(--color-glass-border)] border-l-[3px] ${borderColors[toast.type]}
              rounded-xl px-5 py-4 min-w-[300px] max-w-[400px]
              shadow-[0_8px_32px_rgba(0,0,0,0.4)]
              flex items-start gap-3
              ${toast.leaving ? 'animate-slide-out-right' : 'animate-slide-in-right'}
            `}
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{icons[toast.type]}</span>
            <div className="flex-1">
              <p className="font-semibold text-sm text-white">{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{toast.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
