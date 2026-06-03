import Card from "./Card";

export default function Metric({ title, value, icon }) {
  return (
    <Card className="p-8 min-h-[88px]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className="text-slate-500">{icon}</span>
      </div>
      <p className="mt-3 text-5xl font-extrabold leading-tight">{value}</p>
    </Card>
  );
}
