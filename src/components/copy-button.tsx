"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent } from "react";

type SizeVariant = "sm" | "default" | "lg";

export interface CopyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  size?: SizeVariant;
  onCopied?: () => void;
  onCopyError?: () => void;
}

const iconSizes: Record<SizeVariant, number> = { sm: 14, default: 16, lg: 20 };

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(function CopyButton(
  { value, size = "default", className = "", onClick, onCopied, onCopyError, disabled, ...props },
  ref,
) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      onCopyError?.();
    }
  }

  return <button
    {...props}
    ref={ref}
    type="button"
    disabled={disabled || copied}
    onClick={handleCopy}
    aria-label={copied ? "Mensagem copiada" : "Copiar mensagem"}
    className={`spell-copy-button spell-copy-button-${size} ${copied ? "is-copied" : ""} ${className}`.trim()}
  >
    <CheckIcon className="spell-copy-check" size={iconSizes[size]} strokeWidth={2} aria-hidden="true" />
    <CopyIcon className="spell-copy-icon" size={iconSizes[size]} strokeWidth={2} aria-hidden="true" />
    <span>{copied ? "Copiado" : "Copiar"}</span>
  </button>;
});
