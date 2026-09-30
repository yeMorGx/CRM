"use client";

import { useId, useState } from "react";
import type { ChangeEvent, CSSProperties, InputHTMLAttributes, ReactNode } from "react";

type LabelInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> & {
  field?: "Email" | "Password";
  corner?: number;
  placeholder?: string;
  trailing?: ReactNode;
};

function roundedRectPath(corner: number, width = 400, height = 64) {
  const radius = Math.min(26, Math.max(0, corner));
  return `M ${radius} .75 H ${width - radius} A ${radius} ${radius} 0 0 1 ${width - .75} ${radius} V ${height - radius} A ${radius} ${radius} 0 0 1 ${width - radius} ${height - .75} H ${radius} A ${radius} ${radius} 0 0 1 .75 ${height - radius} V ${radius} A ${radius} ${radius} 0 0 1 ${radius} .75`;
}

export function LabelInput({ field = "Email", corner = 14, id, value, defaultValue, onChange, onFocus, onBlur, trailing, placeholder, className = "", ...inputProps }: LabelInputProps) {
  const generatedId = useId();
  const inputId = id ?? `label-input-${generatedId}`;
  const [focused, setFocused] = useState(false);
  const [hasValue, setHasValue] = useState(Boolean(value ?? defaultValue));
  const raised = focused || hasValue;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasValue(Boolean(event.target.value));
    onChange?.(event);
  }

  return (
    <div className={`lbi ${className}`.trim()} data-focus={focused ? "" : undefined} data-up={raised ? "" : undefined} style={{ "--lbi-corner": `${Math.min(26, Math.max(0, corner))}px` } as CSSProperties}>
        <svg className="lbi-ring" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true">
        <path d={roundedRectPath(corner)} />
        <path className="lbi-gap" d="M 48 0.75 H 8" pathLength="1" />
        <path className="lbi-gap" d={`M 48 0.75 H ${field === "Password" ? 100 : 84}`} pathLength="1" />
      </svg>
      <label className="lbi-label" htmlFor={inputId}>{field}</label>
      <input
        {...inputProps}
        id={inputId}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        placeholder={raised ? placeholder : ""}
      />
      {trailing && <span className="lbi-trailing">{trailing}</span>}
    </div>
  );
}
