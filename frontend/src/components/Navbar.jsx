import { User, QrCode, History, Home, Building2, Printer, LogOut, Menu, X, Settings, Plus, Store, Upload } from "lucide-react";

function NavButton({ children, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function MenuItem({ children, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
    >
      {icon}
      {children}
    </button>
  );
}

function MobileNavButton({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold ${
        active ? "bg-slate-900 text-white" : "text-slate-600"
      }`}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

export default function Navbar({
  page,
  navigate,
  profileOpen,
  setProfileOpen,
  currentUser,
  desktopAvailable = false,
  startLogin,
  startRegister,
  logout,
}) {
  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <button onClick={() => navigate("home")} className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Printer size={22} />
            </div>
            <div className="text-left">
              <h1 className="text-lg font-bold">PrintEase</h1>
              <p className="text-xs text-slate-500">Scan. Upload. Pay. Print.</p>
            </div>
          </button>

          <nav className="hidden items-center gap-2 md:flex">
            <NavButton active={page === "home"} icon={<Home size={16} />} onClick={() => navigate("home")}>Home</NavButton>
            <NavButton active={page === "centre"} icon={<QrCode size={16} />} onClick={() => navigate("centre")}>Centre Code</NavButton>
            <NavButton active={page === "history"} icon={<History size={16} />} onClick={() => navigate("history")}>History</NavButton>
            {currentUser?.role === "user" && (
              <NavButton active={page === "userDashboard"} icon={<User size={16} />} onClick={() => navigate("userDashboard")}>User Dashboard</NavButton>
            )}
            {currentUser?.role === "hub" && (
              <>
                <NavButton active={page === "hubDashboard"} icon={<Building2 size={16} />} onClick={() => navigate("hubDashboard")}>Hub Dashboard</NavButton>
                <NavButton active={page === "hubPrinters"} icon={<Printer size={16} />} onClick={() => navigate("hubPrinters")}>Printers & Agents</NavButton>
              </>
            )}
            {desktopAvailable && (
              <NavButton active={page === "desktopAgent"} icon={<Printer size={16} />} onClick={() => navigate("desktopAgent")}>Desktop Agent</NavButton>
            )}
          </nav>

          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 rounded-full border bg-white px-3 py-2 shadow-sm hover:bg-slate-50"
            >
              <User size={18} />
              <span className="hidden text-sm font-medium sm:inline">{currentUser ? currentUser.name : "Profile"}</span>
              {profileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-3 w-64 rounded-2xl border bg-white p-2 shadow-xl">
                {!currentUser ? (
                  <>
                    <MenuItem icon={<User size={16} />} onClick={() => startLogin("user")}>Login as User</MenuItem>
                    <MenuItem icon={<Store size={16} />} onClick={() => startLogin("hub")}>Login as Print Hub</MenuItem>
                    <MenuItem icon={<Plus size={16} />} onClick={() => startRegister("user")}>Register as User</MenuItem>
                    <MenuItem icon={<Building2 size={16} />} onClick={() => startRegister("hub")}>Register Print Hub</MenuItem>
                  </>
                ) : (
                  <>
                    <div className="px-3 py-2 text-xs text-slate-500">
                      Logged in as <b>{currentUser.role === "hub" ? "Print Hub" : "User"}</b>
                    </div>
                    {currentUser.role === "user" && <MenuItem icon={<User size={16} />} onClick={() => navigate("userDashboard")}>User Dashboard</MenuItem>}
                    {currentUser.role === "hub" && (
                      <>
                        <MenuItem icon={<Building2 size={16} />} onClick={() => navigate("hubDashboard")}>Hub Dashboard</MenuItem>
                        <MenuItem icon={<Printer size={16} />} onClick={() => navigate("hubPrinters")}>Printers & Agents</MenuItem>
                        <MenuItem icon={<Settings size={16} />} onClick={() => navigate("hubPricing")}>Pricing & Payment</MenuItem>
                      </>
                    )}
                    {desktopAvailable && <MenuItem icon={<Printer size={16} />} onClick={() => navigate("desktopAgent")}>Desktop Agent</MenuItem>}
                    <MenuItem icon={<History size={16} />} onClick={() => navigate("history")}>Usage History</MenuItem>
                    <MenuItem icon={<LogOut size={16} />} onClick={logout}>Logout</MenuItem>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 px-2 py-2 shadow-2xl backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md gap-1">
          <MobileNavButton label="Home" active={page === "home"} icon={<Home size={18} />} onClick={() => navigate("home")} />
          <MobileNavButton label="Scan" active={page === "centre"} icon={<QrCode size={18} />} onClick={() => navigate("centre")} />
          <MobileNavButton label="Upload" active={page === "upload"} icon={<Upload size={18} />} onClick={() => navigate("upload")} />
          <MobileNavButton
            label={currentUser?.role === "hub" ? "Hub" : "Orders"}
            active={page === "hubDashboard" || page === "userDashboard" || page === "history"}
            icon={currentUser?.role === "hub" ? <Building2 size={18} /> : <History size={18} />}
            onClick={() => navigate(currentUser?.role === "hub" ? "hubDashboard" : currentUser ? "userDashboard" : "history")}
          />
          <MobileNavButton label="Profile" active={profileOpen} icon={<User size={18} />} onClick={() => setProfileOpen(!profileOpen)} />
        </div>
      </nav>
    </>
  );
}
