"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastTone = "default" | "success" | "error";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ push: (message: string, tone?: ToastTone) => void }>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "default") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[90] flex w-[min(92vw,460px)] -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="fade-up pointer-events-auto flex w-full items-start gap-3 rounded-xl px-4 py-3 text-[13px] leading-snug shadow-2xl"
            style={{
              background: "rgba(24,19,15,0.94)",
              border: "1px solid rgba(246,240,231,0.13)",
              backdropFilter: "blur(18px)",
              color: t.tone === "error" ? "#ffbfa8" : "#f6f0e7",
            }}
          >
            <span
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: t.tone === "error" ? "#e4794a" : t.tone === "success" ? "#9fb98b" : "#cfc0ae" }}
            />
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
