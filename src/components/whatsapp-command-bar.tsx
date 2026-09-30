"use client";

import { Liquid } from "liquid-gooey";
import { ArrowUp } from "lucide-react";
import { useState, type FormEvent } from "react";

const SEND_SIZE = 46;
const SEND_GAP = 8;
const MORPH = { duration: 520, ease: "cubic-bezier(0.22, 1.3, 0.71, 1)" } as const;

type CommandBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
};

export function CommandBar({ value, onChange, onSubmit, disabled = false, sending = false, placeholder = "Escreva uma mensagem" }: CommandBarProps) {
  const [focused, setFocused] = useState(false);
  const expanded = !disabled && (focused || Boolean(value.trim()));
  const canSend = !disabled && !sending && Boolean(value.trim());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) onSubmit();
  }

  return <form className="wa-command-bar" onSubmit={submit}>
    <Liquid className="wa-command-goo" blur={3} contrast={22} fill="var(--crm-surface-raised, #1b1c1c)" filterPadding={60}>
      <Liquid.Item className="wa-command-slot wa-command-input-slot" transition={MORPH}>
        <div className="wa-command-field" data-expanded={expanded || undefined}>
          <input
            aria-label="Mensagem para o contato"
            autoComplete="off"
            disabled={disabled || sending}
            maxLength={4096}
            onBlur={() => setFocused(false)}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            value={value}
          />
        </div>
      </Liquid.Item>
      {/* The send body starts tucked beneath the field and separates on focus. */}
      <Liquid.Item className="wa-command-slot" x={expanded ? 0 : -(SEND_SIZE + SEND_GAP)} transition={MORPH}>
        <button
          aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
          className="wa-command-send"
          data-expanded={expanded || undefined}
          disabled={!canSend}
          tabIndex={expanded ? 0 : -1}
          type="submit"
        >
          <ArrowUp size={19} strokeWidth={2.2} />
        </button>
      </Liquid.Item>
    </Liquid>
  </form>;
}
