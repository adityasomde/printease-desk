export default function Card({ children, className = "" }) {
  return <div className={`rounded-3xl border bg-white p-6 shadow-sm ${className}`}>{children}</div>;
}
