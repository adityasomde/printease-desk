import { useEffect, useState } from "react";
import { Activity, Printer, FileText, CheckCircle, Users, IndianRupee, Calendar, CalendarDays, UserPlus, Eye, Clock } from "lucide-react";
import { apiRequest } from "../services/api";

function StatCard({ title, value, icon: Icon, color, delay }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-white p-6 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md animate-in fade-in slide-in-from-bottom-4`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10 ${color}`} />
      
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <h3 className="mt-2 text-4xl font-extrabold text-slate-900">{value}</h3>
        </div>
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${color} bg-opacity-10`}>
          <Icon size={28} className={color.replace("bg-", "text-")} />
        </div>
      </div>
    </div>
  );
}

export default function PlatformStatsPage() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalPages: 0,
    totalRevenue: 0,
    totalPrinters: 0,
    totalVisits: 0,
    totalPageViews: 0,
    totalSecondsSpent: 0,
    liveUsers: 0,
    visitsToday: 0,
    visitsThisMonth: 0,
    registeredUsers: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiRequest("/api/stats/global");
        setStats(data);
        setLastUpdated(new Date());
      } catch (error) {
        console.error("Failed to load global stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white sm:flex-row sm:p-10">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-md">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </span>
              System Analytics
            </div>
            <span className="text-xs text-slate-400">
              Last updated: {lastUpdated.toLocaleTimeString()} (auto-refreshes every 10s)
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">PrintEase Global Stats</h1>
          <p className="mt-2 text-slate-300">Live platform performance and usage metrics.</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white/10 p-6 backdrop-blur-md">
          <span className="text-sm font-medium text-slate-300">Live Users Right Now</span>
          <div className="mt-1 flex items-baseline gap-2 text-5xl font-black text-emerald-400">
            {stats.liveUsers}
          </div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Prints Executed"
          value={stats.totalOrders}
          icon={CheckCircle}
          color="bg-blue-500"
          delay={100}
        />
        <StatCard
          title="Total Pages Printed"
          value={stats.totalPages}
          icon={FileText}
          color="bg-purple-500"
          delay={200}
        />
        <StatCard
          title="Total Revenue (₹)"
          value={stats.totalRevenue.toFixed(2)}
          icon={IndianRupee}
          color="bg-emerald-500"
          delay={300}
        />
        <StatCard
          title="Total Platform Visits"
          value={stats.totalVisits}
          icon={Users}
          color="bg-amber-500"
          delay={400}
        />
        <StatCard
          title="Total Printers/Hubs"
          value={stats.totalPrinters}
          icon={Printer}
          color="bg-rose-500"
          delay={500}
        />
        <StatCard
          title="Active Sessions"
          value={stats.liveUsers}
          icon={Activity}
          color="bg-cyan-500"
          delay={600}
        />
        <StatCard
          title="Visits Today"
          value={stats.visitsToday}
          icon={Calendar}
          color="bg-orange-500"
          delay={700}
        />
        <StatCard
          title="Visits This Month"
          value={stats.visitsThisMonth}
          icon={CalendarDays}
          color="bg-indigo-500"
          delay={800}
        />
        <StatCard
          title="Registered Users"
          value={stats.registeredUsers}
          icon={UserPlus}
          color="bg-pink-500"
          delay={900}
        />
        <StatCard
          title="Total Page Views"
          value={stats.totalPageViews}
          icon={Eye}
          color="bg-teal-500"
          delay={1000}
        />
        <StatCard
          title="Total Time Spent (Hours)"
          value={(stats.totalSecondsSpent / 3600).toFixed(1)}
          icon={Clock}
          color="bg-violet-500"
          delay={1100}
        />
      </div>
    </div>
  );
}
