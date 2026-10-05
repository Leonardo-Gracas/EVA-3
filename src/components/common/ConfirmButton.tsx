import { useEffect, useState, type ReactNode } from 'react';

// Botão de dois cliques: o primeiro arma, o segundo confirma. Evita diálogos do navegador.
export default function ConfirmButton({
  onConfirm, children, confirmText = 'Confirmar?', className = 'btn btn-danger btn-sm', disabled, title,
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmText?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (armed) { setArmed(false); onConfirm(); } else setArmed(true);
      }}
    >
      {armed ? confirmText : children}
    </button>
  );
}
