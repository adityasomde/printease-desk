import { motion } from "framer-motion";

import { User, Upload, Store, Plus, Building2, Search } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";

export default function HomePage({
  currentUser,
  navigate,
  centres,
  startLogin,
  startRegister,
  startDirectUpload,
  selectCentreAndUpload,
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-stretch">
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col justify-between gap-5 rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="space-y-3">
            <div className="inline-flex rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              QR based web printing platform
            </div>
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Print documents securely.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Scan QR or enter code to select a centre, upload your document, pay, and collect your print.
              </p>
            </div>
          </div>
          <div className="grid gap-3">
            <button
              onClick={startDirectUpload}
              className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 py-5 text-lg font-bold text-white shadow-lg transition hover:bg-slate-800"
            >
              <Upload size={30} />
              Upload Documents
            </button>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => navigate("centre")}
                className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 font-semibold shadow-sm hover:bg-slate-50"
              >
                <Search size={18} />
                Scan / Select Centre
              </button>

              <button
                onClick={() => startLogin("user")}
                className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 font-semibold shadow-sm hover:bg-slate-50"
              >
                <User size={18} />
                Login / My Orders
              </button>
            </div>
          </div>
        </motion.section>

        {currentUser ? (
          <Card>
            <h3 className="text-xl font-bold">Welcome back, {currentUser.name || "PrintEase user"}</h3>
            <p className="mt-2 text-sm text-slate-600">
              Continue with a new upload or open your {currentUser.role === "hub" ? "hub dashboard" : "orders"}.
            </p>
            <div className="mt-5 grid gap-3">
              <button onClick={startDirectUpload} className="rounded-2xl bg-slate-900 px-5 py-4 font-semibold text-white">
                Upload Documents
              </button>
              <button onClick={() => navigate(currentUser.role === "hub" ? "hubDashboard" : "userDashboard")} className="rounded-2xl border bg-white px-5 py-4 font-semibold hover:bg-slate-50">
                {currentUser.role === "hub" ? "Open Hub Dashboard" : "My Orders"}
              </button>
            </div>
          </Card>
        ) : (
          <Card>
            <h3 className="text-xl font-bold">Login / Register</h3>
            <p className="mt-2 text-sm text-slate-600">Choose your role before login.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button onClick={() => startLogin("user")} className="rounded-2xl bg-slate-900 p-4 text-left text-white">
                <User className="mb-3" />
                <b>User Login</b>
                <p className="text-sm text-slate-300">For print history and profile.</p>
              </button>
              <button onClick={() => startLogin("hub")} className="rounded-2xl bg-slate-900 p-4 text-left text-white">
                <Store className="mb-3" />
                <b>Print Hub Login</b>
                <p className="text-sm text-slate-300">For orders, pricing, payment.</p>
              </button>
              <button onClick={() => startRegister("user")} className="rounded-2xl border bg-white p-4 text-left hover:bg-slate-50">
                <Plus className="mb-3" />
                <b>Register User</b>
                <p className="text-sm text-slate-500">Mobile number based account.</p>
              </button>
              <button onClick={() => startRegister("hub")} className="rounded-2xl border bg-white p-4 text-left hover:bg-slate-50">
                <Building2 className="mb-3" />
                <b>Register Print Hub</b>
                <p className="text-sm text-slate-500">Create centre code and pricing.</p>
              </button>
            </div>
          </Card>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-bold">Available Printing Centres</h3>
            <p className="text-sm text-slate-600">Select a centre directly and upload your document.</p>
          </div>
          <button onClick={() => navigate("centre")} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">
            Search by Code
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {centres.map((centre) => (
            <CentrePriceCard key={centre.id} centre={centre} onUpload={() => selectCentreAndUpload(centre)} />
          ))}
        </div>
      </Card>
    </div>
  );
}
