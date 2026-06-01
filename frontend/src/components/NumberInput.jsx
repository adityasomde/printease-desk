export default function NumberInput({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border bg-white p-4">
      <span className="font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <span>₹</span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
        />
      </div>
    </label>
  );
}
