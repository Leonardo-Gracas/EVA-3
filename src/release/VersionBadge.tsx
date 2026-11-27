import { useState } from 'react';
import Modal from '../components/common/Modal';
import ReleaseNotes from './ReleaseNotes';
import { VERSION } from './releases';

/** Versão no canto inferior esquerdo; clicar abre as notas de atualização. */
export default function VersionBadge() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="version-badge" onClick={() => setOpen(true)} title="Ver as novidades desta versão">v{VERSION}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Novidades" width={620}>
        <ReleaseNotes />
      </Modal>
    </>
  );
}
