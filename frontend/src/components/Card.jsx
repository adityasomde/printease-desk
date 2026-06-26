export default function Card({ children, className = "" }) {
  return <div className={`rounded-3xl border bg-white p-4 sm:p-6 shadow-sm text-base sm:text-lg min-w-0 ${className}`}>{children}</div>;
}
