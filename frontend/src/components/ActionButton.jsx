export default function ActionButton({ icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border bg-white p-5 text-left font-semibold hover:bg-slate-50 min-h-[56px]"
    >
      <span className="text-slate-700 text-lg">{icon}</span>
      <span className="text-base">{title}</span>
    </button>
  );
}
