import { useState } from 'react';
import { LIMITS } from '../rules/validate';

export default function UsernamePage({ initial, onDone }: { initial?: string; onDone: (name: string) => void }) {
  const [name, setName] = useState(initial ?? '');
  const ok = name.trim().length >= 2;
  return (
    <div className="page page-narrow">
      <div className="hero">
        <h1>EVA 3</h1>
        <p>Gerenciador de campanhas</p>
      </div>
      <form className="card card-gold center-box col gap-lg" onSubmit={(e) => { e.preventDefault(); if (ok) onDone(name.trim()); }}>
        <div className="field">
          <label className="label">Como quer ser chamado na mesa?</label>
          <input className="input" autoFocus value={name} maxLength={LIMITS.userName} onChange={(e) => setName(e.target.value)} placeholder="Seu nome de usuário" />
        </div>
        <button className="btn btn-primary btn-lg" disabled={!ok}>{initial ? 'Salvar' : 'Continuar'}</button>
        <p className="tiny muted center">O nome fica salvo neste navegador. Mestre e jogadores verão este nome.</p>
      </form>
    </div>
  );
}
