"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string; tone?: "lime" | "blue" | "amber" | "red" };

export function ProspectaSelect({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select.Root
      items={options}
      value={value}
      onValueChange={(next) => { if (typeof next === "string") onChange(next); }}
      disabled={disabled}
    >
      <div className="prospecta-select-field">
        <Select.Label className="prospecta-select-label">{label}</Select.Label>
        <Select.Trigger className="prospecta-select-trigger">
          <Select.Value className="prospecta-select-value" />
          <Select.Icon className="prospecta-select-chevron"><ChevronDown size={15} aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
      </div>
      <Select.Portal className="prospecta-select-portal">
        <Select.Positioner className="prospecta-select-positioner" alignItemWithTrigger={false} sideOffset={6}>
          <Select.Popup className="prospecta-select-popup">
            <Select.List className="prospecta-select-list">
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className="prospecta-select-option">
                  {option.tone && <span className={`prospecta-select-swatch tone-${option.tone}`} aria-hidden="true" />}
                  <Select.ItemText className="prospecta-select-option-text">{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="prospecta-select-check"><Check size={14} aria-hidden="true" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
