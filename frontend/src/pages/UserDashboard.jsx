import { FileText, IndianRupee, Phone, QrCode, Upload, History } from "lucide-react";
import Card from "../components/Card";
import Metric from "../components/Metric";
import ActionButton from "../components/ActionButton";

export default function UserDashboard({ currentUser, navigate, orders }) {
  const totalSpent = orders.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold">User Dashboard</h2>
          <p className="text-slate-600">Welcome, {currentUser?.name || "User"}</p>
        </div>
        <button onClick={() => navigate("centre")} className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white">
          New Print Order
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Total Orders" value={orders.length} icon={<FileText />} />
        <Metric title="Total Spent" value={`₹${totalSpent}`} icon={<IndianRupee />} />
        <Metric title="Mobile" value={currentUser?.mobile || "-"} icon={<Phone />} />
      </div>

      <Card>
        <h3 className="text-xl font-bold">Quick Actions</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ActionButton icon={<QrCode />} title="Enter Centre Code" onClick={() => navigate("centre")} />
          <ActionButton icon={<Upload />} title="Direct Upload" onClick={() => navigate("upload")} />
          <ActionButton icon={<History />} title="Usage History" onClick={() => navigate("history")} />
        </div>
      </Card>
    </div>
  );
}
