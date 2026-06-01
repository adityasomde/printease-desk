export default function ActionButton({ icon, title, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-2xl border bg-white p-4 text-left font-semibold hover:bg-slate-50">
      <span className="text-slate-700">{icon}</span>
      {title}
    </button>
  );
}
