import { Eye, EyeOff, Lock, Mail, QrCode, ShieldCheck, Sparkles, Store, User } from "lucide-react";
import Card from "../components/Card";
import Input from "../components/Input";

export default function AuthPage({
  authRole,
  setAuthRole,
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  username,
  setUsername,
  name,
  setName,
  mobile,
  setMobile,
  hubName,
  setHubName,
  hubCode,
  setHubCode,
  generateStrongPassword,
  handleAuthSubmit,
  handleGoogleLogin,
  authError,
  authLoading,
}) {
  const isHub = authRole === "hub";
  const isRegister = authMode === "register";
  const isProfile = authMode === "profile";
  const showSignupFields = isRegister || isProfile;
  const showPasswordFields = isRegister;
  const passwordType = showPassword ? "text" : "password";
  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
      aria-label={showPassword ? "Hide password" : "Show password"}
    >
      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <Card className="mx-auto max-w-2xl">
      <form onSubmit={(event) => {
        event.preventDefault();
        handleAuthSubmit();
      }}>
        <div>
          <h2 className="text-2xl font-bold">
            {isProfile ? "Complete Profile" : isRegister ? "Create Account" : "Login"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {isProfile
              ? "Choose your PrintEase ID, role, and optional contact details."
              : "Login with your username or email. Your username is your PrintEase ID."}
          </p>
        </div>

        {!isProfile && (
          <button
            type="button"
            disabled
            onClick={handleGoogleLogin}
            className="mt-6 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border bg-slate-50 px-4 py-3 font-semibold text-slate-400"
          >
            <ShieldCheck size={18} /> Continue with Google - Coming later
          </button>
        )}

        {!isRegister && !isProfile && (
          <div className="mt-6 grid gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Login as</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setAuthRole("user")} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${authRole === "user" ? "border-slate-900 bg-slate-900 text-white" : "bg-white"}`}>
                  User
                </button>
                <button type="button" onClick={() => setAuthRole("hub")} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${authRole === "hub" ? "border-slate-900 bg-slate-900 text-white" : "bg-white"}`}>
                  Print Hub
                </button>
              </div>
            </div>
            <Input
              label="Username or email"
              icon={<Mail size={18} />}
              value={email}
              setValue={setEmail}
              placeholder="username or you@example.com"
              type="text"
              name="username"
              autoComplete="username"
              disabled={authLoading}
              helperText="Use your PrintEase username or email address."
            />
            <Input
              label="Password"
              icon={<Lock size={18} />}
              value={password}
              setValue={setPassword}
              placeholder="Enter password"
              type={passwordType}
              name="password"
              autoComplete="current-password"
              disabled={authLoading}
              trailing={passwordToggle}
            />
          </div>
        )}

        {showSignupFields && (
          <div className="mt-6 grid gap-4">
            <Input
              label="Name"
              icon={<User size={18} />}
              value={name}
              setValue={setName}
              placeholder="Your name"
              name="name"
              autoComplete="name"
              disabled={authLoading}
              maxLength={50}
            />
            <Input
              label="PrintEase username"
              icon={<User size={18} />}
              value={username}
              setValue={setUsername}
              placeholder="chaitanyamunde"
              name="username"
              autoComplete="username"
              disabled={authLoading}
              helperText="Lowercase letters and numbers only. This is your visible PrintEase ID."
            />

            {showPasswordFields && (
              <>
                <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">Create password</p>
                    <p className="text-sm text-slate-600">Generate a strong password locally, or enter one once.</p>
                  </div>
                  <button
                    type="button"
                    onClick={generateStrongPassword}
                    disabled={authLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Sparkles size={16} /> Generate strong password
                  </button>
                </div>
                <Input
                  label="Password"
                  icon={<Lock size={18} />}
                  value={password}
                  setValue={setPassword}
                  placeholder="Enter password"
                  type={passwordType}
                  name="password"
                  autoComplete="new-password"
                  disabled={authLoading}
                  trailing={passwordToggle}
                />
              </>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Role</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setAuthRole("user")} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${authRole === "user" ? "border-slate-900 bg-slate-900 text-white" : "bg-white"}`}>
                  User
                </button>
                <button type="button" onClick={() => setAuthRole("hub")} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${authRole === "hub" ? "border-slate-900 bg-slate-900 text-white" : "bg-white"}`}>
                  Print Hub
                </button>
              </div>
            </div>

            {isHub && <Input label="Hub / Shop Name" icon={<Store size={18} />} value={hubName} setValue={setHubName} placeholder="Example: Sai Printing Hub" disabled={authLoading} />}
            {isHub && <Input label="Centre Code" icon={<QrCode size={18} />} value={hubCode} setValue={setHubCode} placeholder="Example: 2045" disabled={authLoading} maxLength={8} />}

            <div className="rounded-2xl border bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Contact details</p>
              <p className="mt-1 text-xs text-slate-500">
                Email is optional and unverified. Username is enough for password login.
              </p>
              <div className="mt-4 grid gap-4">
                <Input
                  label="Email address (optional)"
                  icon={<Mail size={18} />}
                  value={email}
                  setValue={setEmail}
                  placeholder="you@example.com"
                  type="email"
                  name="email"
                  autoComplete="email"
                  disabled={authLoading || isProfile}
                  helperText="Optional contact email. It is not verified right now."
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 text-green-600" size={20} />
            <p className="text-sm text-slate-600">
              PrintEase verifies your password on the backend and loads your saved role before protected pages open.
            </p>
          </div>
        </div>

        {authError && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
            {authError}
          </p>
        )}

        <button type="submit" disabled={authLoading} className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400">
          {authLoading ? "Please wait..." : isProfile ? "Save Profile" : isRegister ? "Sign Up" : "Login"}
        </button>

        {!isProfile && !isRegister && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={authLoading} onClick={() => {
              setAuthRole("user");
              setAuthMode("register");
            }} className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400">
              Register as User
            </button>
            <button type="button" disabled={authLoading} onClick={() => {
              setAuthRole("hub");
              setAuthMode("register");
            }} className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400">
              Register as Print Hub
            </button>
          </div>
        )}

        {isRegister && (
          <button type="button" disabled={authLoading} onClick={() => setAuthMode("login")} className="mt-3 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400">
            Already have an account? Login
          </button>
        )}
      </form>
    </Card>
  );
}
