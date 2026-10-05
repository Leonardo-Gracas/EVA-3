import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Share2, Smartphone } from 'lucide-react';
import { inviteLink } from '../../net/config';

// Convite da sala: QR + copiar + compartilhar. Adaptado do EVA S (online/RoomInvite.tsx).
export default function RoomInvite({ code }: { code: string }) {
  const link = inviteLink(code);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  useEffect(() => {
    QRCode.toDataURL(link, { width: 420, margin: 1, color: { dark: '#15110d', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* o texto está visível para copiar à mão */ }
  };

  const share = () => {
    navigator.share?.({ title: 'EVA 3 — mesa', text: `Entra na mesa! Código ${code}`, url: link }).catch(() => undefined);
  };

  return (
    <div className="row-wrap gap-lg" style={{ alignItems: 'flex-start' }}>
      <div className="col" style={{ alignItems: 'center' }}>
        {qr ? <img src={qr} alt="QR do convite" width={170} height={170} style={{ borderRadius: 10, background: '#fff' }} />
          : <div style={{ width: 170, height: 170, borderRadius: 10, background: 'var(--bg-elevated)' }} />}
        <span className="tiny muted row"><Smartphone size={12} /> Aponte a câmera do celular</span>
      </div>
      <div className="col grow" style={{ minWidth: 220 }}>
        <label className="label">Código da sala</label>
        <div className="row card" style={{ padding: '8px 10px' }}>
          <code className="grow" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.25em' }}>{code}</code>
          <button className="btn btn-ghost btn-icon" onClick={() => copy('code')} title="Copiar código">{copied === 'code' ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}</button>
        </div>
        <label className="label">Link de convite</label>
        <div className="row card" style={{ padding: '8px 10px' }}>
          <code className="grow small" style={{ wordBreak: 'break-all' }}>{link}</code>
          <button className="btn btn-ghost btn-icon" onClick={() => copy('link')} title="Copiar link">{copied === 'link' ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}</button>
          {typeof navigator.share === 'function' && <button className="btn btn-ghost btn-icon" onClick={share} title="Compartilhar"><Share2 size={14} /></button>}
        </div>
        <p className="tiny muted">A mesa funciona enquanto esta aba estiver aberta. Se você recarregar a página, os jogadores reconectam sozinhos.</p>
      </div>
    </div>
  );
}
