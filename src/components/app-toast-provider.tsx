"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; message: string; kind: ToastKind };
type ToastContextValue = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastContextValue | null>(null);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<ToastContextValue>((message, kind = "info") => {
    const normalized = message.trim();
    if (!normalized) return;
    const id = ++nextId.current;
    setItems((current) => [...current.slice(-3), { id, message: normalized, kind }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), kind === "error" ? 6500 : 4800));
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="app-toast-stack" aria-label="Avisos" aria-live="polite" aria-relevant="additions">
        {items.map((item) => {
          const Icon = item.kind === "error" ? AlertCircle : item.kind === "success" ? CheckCircle2 : Info;
          return (
            <div className={`app-toast app-toast-${item.kind}`} key={item.id} role={item.kind === "error" ? "alert" : "status"}>
              <Icon size={17} aria-hidden="true" />
              <span>{item.message}</span>
              <button type="button" onClick={() => dismiss(item.id)} aria-label="Dispensar aviso"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const notify = useContext(ToastContext);
  return notify ?? (() => undefined);
}
