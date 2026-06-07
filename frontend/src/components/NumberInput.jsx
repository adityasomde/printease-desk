import { useState } from "react";

export default function NumberInput({ label, value, onChange, min = 0, max = 10000, step = 0.5, prefix = "₹", helperText = "" }) {
  const [localValue, setLocalValue] = useState(String(value ?? ""));
  const [error, setError] = useState("");

  function handleChange(e) {
    const raw = e.target.value;
    setLocalValue(raw);

    if (raw === "" || raw === "." || raw.endsWith(".")) {
      setError("");
      return;
    }

    const parsed = parseFloat(raw);

    if (isNaN(parsed)) {
      setError("Enter a valid number");
      return;
    }

    if (parsed < min) {
      setError(`Minimum is ${prefix}${min}`);
      return;
    }

    if (parsed > max) {
      setError(`Maximum is ${prefix}${max}`);
      return;
    }

    setError("");
  }

  function handleBlur() {
    const raw = localValue.trim();

    if (raw === "" || raw === ".") {
      setLocalValue(String(value ?? ""));
      setError("");
      return;
    }

    const parsed = parseFloat(raw);

    if (isNaN(parsed) || parsed < min || parsed > max) {
      setLocalValue(String(value ?? ""));
      setError("");
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    setLocalValue(String(rounded));
    setError("");

    if (rounded !== Number(value)) {
      onChange(rounded);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.target.blur();
    }
  }

  const hasError = Boolean(error);

  return (
    <label className="block rounded-2xl border bg-white p-4 transition hover:shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{prefix}</span>
          <input
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={`w-24 rounded-xl border px-3 py-2 text-right outline-none transition focus:ring-2 ${
              hasError
                ? "border-red-300 focus:ring-red-200"
                : "border-slate-200 focus:ring-slate-300"
            }`}
          />
        </div>
      </div>
      {hasError && (
        <p className="mt-2 text-right text-xs font-medium text-red-500">{error}</p>
      )}
      {helperText && !hasError && (
        <p className="mt-2 text-right text-xs text-slate-400">{helperText}</p>
      )}
    </label>
  );
}
