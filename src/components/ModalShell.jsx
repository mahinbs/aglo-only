/**
 * Lightweight modal (algo-only has no Radix/shadcn). Click backdrop to close.
 */
export function ModalShell({
  open,
  title,
  onClose,
  children,
  panelClassName = "",
  bodyClassName = "",
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 p-3 backdrop-blur-[10px] sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ts-modal-title"
        className={`max-h-[88vh] w-[min(560px,calc(100vw-24px))] overflow-auto rounded-2xl border border-cyan-400/25 bg-[linear-gradient(165deg,rgba(12,17,28,0.98),rgba(6,8,13,0.99))] shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_40px_rgba(56,189,248,0.06)] sm:w-[min(560px,calc(100vw-32px))] ${panelClassName}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b border-cyan-400/10 px-4 py-3 sm:px-[18px] sm:py-4"
        >
          <h2
            id="ts-modal-title"
            className="m-0 pr-2 text-sm font-bold tracking-[0.5px] text-slate-100 sm:text-[15px]"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onClose?.()}
            className="h-9 w-9 cursor-pointer rounded-[10px] border border-slate-400/25 bg-slate-900/60 text-[20px] leading-none text-slate-400"
          >
            ×
          </button>
        </div>
        <div className={`px-4 pb-5 pt-4 sm:px-5 sm:pb-[22px] sm:pt-[18px] ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
