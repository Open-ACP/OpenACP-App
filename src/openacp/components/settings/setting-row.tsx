import React from "react";

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-weak last:border-b-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
