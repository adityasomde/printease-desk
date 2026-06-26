export default function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 min-w-0">
      <span className="text-slate-500 whitespace-nowrap shrink-0">{label}</span>
      <span className="text-right font-semibold capitalize min-w-0 break-words">{value}</span>
    </div>
  );
}
