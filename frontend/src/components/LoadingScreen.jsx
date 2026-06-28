export default function LoadingScreen() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <div className="flex items-center gap-3 text-slate-500">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-500"></span>
        </span>
        <span className="font-medium animate-pulse text-sm">Loading application...</span>
      </div>
    </div>
  );
}
