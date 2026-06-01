import Card from "./Card";

export default function Metric({ title, value, icon }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </Card>
  );
}
