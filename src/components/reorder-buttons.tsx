import { ChevronDown, ChevronUp } from "lucide-react";

export function ReorderButtons({
  onUp,
  onDown,
  disableUp,
  disableDown,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
}) {
  return (
    <div className="flex shrink-0">
      <button
        type="button"
        aria-label="上へ"
        disabled={disableUp}
        onClick={onUp}
        className="flex size-11 items-center justify-center rounded-l-md bg-surface-2 text-fg disabled:text-faint"
      >
        <ChevronUp className="size-5" />
      </button>
      <button
        type="button"
        aria-label="下へ"
        disabled={disableDown}
        onClick={onDown}
        className="flex size-11 items-center justify-center rounded-r-md bg-surface-2 text-fg disabled:text-faint"
      >
        <ChevronDown className="size-5" />
      </button>
    </div>
  );
}
