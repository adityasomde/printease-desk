export default function Input({ label, icon, value, setValue, placeholder, type = "text", helperText = "", trailing = null, ...inputProps }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-slate-300">
        <span className="text-slate-400">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none disabled:cursor-not-allowed disabled:text-slate-500"
          {...inputProps}
        />
        {trailing}
      </div>
      {helperText && <span className="mt-2 block text-xs text-slate-500">{helperText}</span>}
    </label>
  );
}
