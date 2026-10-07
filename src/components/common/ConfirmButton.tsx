import { useState, type ReactNode } from 'react';
import ConfirmModal from './ConfirmModal';

// Botão de ação destrutiva: o clique abre um modal de confirmação.
// `onConfirm` pode devolver `false` (ou um Ack com `ok: false`) para manter o modal aberto.
export default function ConfirmButton({
  onConfirm, children, modalTitle, message, confirmLabel = 'Excluir', className = 'btn btn-danger btn-sm', disabled, title,
}: {
  onConfirm: () => unknown;
  children: ReactNode;
  modalTitle: string;
  message: ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} disabled={disabled} title={title} aria-label={title} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <ConfirmModal title={modalTitle} confirmLabel={confirmLabel} onClose={() => setOpen(false)}
          onConfirm={async () => {
            const r = await onConfirm();
            if (r === false) return false;
            if (r && typeof r === 'object' && 'ok' in r) return Boolean(r.ok);
            return true;
          }}>
          {message}
        </ConfirmModal>
      )}
    </>
  );
}
