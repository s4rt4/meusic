import { useEffect } from "react";
import { Pencil } from "./icons";

/**
 * A tiny right-click menu for a song row. Positioned at the cursor; closes on
 * any outside click, right-click, Esc, scroll, or window blur. Kept minimal
 * (one action for now) but structured to grow.
 */
export function TrackContextMenu({
  x,
  y,
  onEdit,
  onClose,
}: {
  x: number;
  y: number;
  onEdit: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Keep the menu on-screen near the right/bottom edges.
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 80);

  return (
    <div
      className="fixed inset-0 z-[55]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
      onWheel={onClose}
    >
      <div
        className="glass-strong absolute min-w-[180px] overflow-hidden rounded-xl py-1 shadow-2xl"
        style={{ left, top, animation: "aboutPop 0.12s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onEdit();
            onClose();
          }}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-white/90 transition hover:bg-white/10"
        >
          <Pencil className="h-4 w-4 text-white/60" />
          Edit info lagu…
        </button>
      </div>
    </div>
  );
}
