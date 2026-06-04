export default function DashboardLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f4f4f5]">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 rounded-full border-[3px] border-[#e4e4e7] border-t-[#18181b]"
          style={{ animation: "spin 0.75s linear infinite" }}
        />
        <span className="text-xs font-medium tracking-widest text-[#71717a] uppercase">
          Aira
        </span>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
