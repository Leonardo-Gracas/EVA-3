import { useState, type ReactNode } from 'react';
import Modal from './Modal';

// Confirmação em modal para ações sem volta (ex.: excluir ficha). Para um botão
// que já abre o modal sozinho, use o ConfirmButton.
export default function ConfirmModal({ title, children, confirmLabel, onConfirm, onClose }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal open width={440} title={title} onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" autoFocus onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" disabled={busy} onClick={() => void go()}>{confirmLabel}</button>
        </>
      }>
      {children}
    </Modal>
  );
}
