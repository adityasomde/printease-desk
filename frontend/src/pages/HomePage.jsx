import { motion } from "framer-motion";

import { User, Upload, Store, Plus, Building2 } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";

export default function HomePage({
  navigate,
  centres,
  startLogin,
  startRegister,
  startDirectUpload,
  selectCentreAndUpload,
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="inline-flex rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            QR based web printing platform
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight md:text-6xl">
            Print documents without standing in queue.
          </h2>
          <p className="max-w-xl text-lg text-slate-600">
            Scan a centre QR code or enter a short code, upload your document, pay securely, and collect your printed set.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <button
              onClick={startDirectUpload}
              className="flex items-center justify-center gap-3 rounded-3xl bg-slate-900 px-10 py-6 text-xl font-bold text-white shadow-2xl transition hover:scale-105 hover:bg-slate-800"
            >
              <Upload size={30} />
              Upload Document Now
            </button>

            <button
              onClick={() => navigate("centre")}
              className="rounded-2xl border bg-white px-6 py-3 font-semibold shadow-sm hover:bg-slate-50"
            >
              Enter Centre Code
            </button>

            <button
              onClick={() => navigate("centre")}
              className="rounded-2xl border bg-white px-6 py-3 font-semibold shadow-sm hover:bg-slate-50"
            >
              QR Scanner Coming Soon
            </button>
          </div>
        </motion.section>

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
