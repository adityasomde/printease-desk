export default function StatusBadge({ children, color = "slate" }) {
  const classes = color === "green" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}
