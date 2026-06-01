import { Lock, Phone, QrCode, ShieldCheck, Store, User } from "lucide-react";
import Card from "../components/Card";
import Input from "../components/Input";

export default function AuthPage({
  authRole,
  setAuthRole,
  authMode,
  setAuthMode,
  mobile,
  setMobile,
  password,
  setPassword,
  name,
  setName,
  hubName,
  setHubName,
  hubCode,
  setHubCode,
  handleAuthSubmit,
  authError,
  authLoading,
}) {
  const isHub = authRole === "hub";
  const isRegister = authMode === "register";

  return (
    <Card className="mx-auto max-w-2xl">
      <form onSubmit={(event) => {
        event.preventDefault();
        handleAuthSubmit();
      }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {isRegister ? "Register" : "Login"} as {isHub ? "Print Hub" : "User"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">Use your registered mobile number and password.</p>
          </div>
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button type="button" onClick={() => setAuthRole("user")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${authRole === "user" ? "bg-white shadow" : ""}`}>
              User
            </button>
            <button type="button" onClick={() => setAuthRole("hub")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${authRole === "hub" ? "bg-white shadow" : ""}`}>
              Print Hub
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {isRegister && <Input label="Name" icon={<User size={18} />} value={name} setValue={setName} placeholder="Enter name" autoComplete="name" disabled={authLoading} />}
          <Input label="Mobile Number" icon={<Phone size={18} />} value={mobile} setValue={setMobile} placeholder="10 digit mobile" inputMode="numeric" autoComplete="tel" disabled={authLoading} />
          <Input label="Password" icon={<Lock size={18} />} value={password} setValue={setPassword} placeholder="Enter password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} disabled={authLoading} />
          {isHub && isRegister && <Input label="Print Hub Name" icon={<Store size={18} />} value={hubName} setValue={setHubName} placeholder="Example: Sai Printing Hub" disabled={authLoading} />}
          {isHub && isRegister && <Input label="Centre Code" icon={<QrCode size={18} />} value={hubCode} setValue={setHubCode} placeholder="Example: 2045" disabled={authLoading} />}
        </div>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 text-green-600" size={20} />
            <p className="text-sm text-slate-600">
              Accounts are checked by the backend before the dashboard opens.
            </p>
          </div>
        </div>

        {authError && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
            {authError}
          </p>
        )}

        <button type="submit" disabled={authLoading} className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400">
          {authLoading ? "Please wait..." : isRegister ? "Create Account" : "Login"}
        </button>
        <button type="button" disabled={authLoading} onClick={() => setAuthMode(isRegister ? "login" : "register")} className="mt-3 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400">
          {isRegister ? "Already have account? Login" : "New here? Register"}
        </button>
      </form>
    </Card>
  );
}
