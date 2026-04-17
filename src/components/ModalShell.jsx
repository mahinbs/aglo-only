/**
 * Lightweight modal (algo-only has no Radix/shadcn). Click backdrop to close.
 */
export function ModalShell({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ts-modal-title"
        style={{
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "min(88vh, 900px)",
          overflow: "auto",
          borderRadius: 16,
          border: "1px solid rgba(56, 189, 248, 0.22)",
          background: "linear-gradient(165deg, rgba(12, 17, 28, 0.98), rgba(6, 8, 13, 0.99))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.65), 0 0 40px rgba(56, 189, 248, 0.06)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px",
            borderBottom: "1px solid rgba(56, 189, 248, 0.1)",
          }}
        >
          <h2 id="ts-modal-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f1f5f9", fontFamily: "Orbitron, sans-serif", letterSpacing: 0.5 }}>
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onClose?.()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(148, 163, 184, 0.25)",
              background: "rgba(15, 23, 42, 0.6)",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "18px 20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}
