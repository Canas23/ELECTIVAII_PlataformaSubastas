import { X } from "lucide-react";

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "warning";
}

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

/** Avisos flotantes en la esquina (te superaron, ganaste, etc.). */
function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} aria-label="Cerrar aviso">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toasts;
