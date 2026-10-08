import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Dices, Pencil, RotateCcw } from 'lucide-react';
import Modal from './Modal';
import Avatar from './Avatar';
import {
  BACKGROUNDS, BEARDS, BROWS, EYE_COLORS, EYES, FACES, HAIR_COLORS, HAIRS, MOUTHS, NOSES, OUTFITS,
  randomAvatar, sameAvatar, sanitizeAvatar, SKINS, type AvatarConfig,
} from '../../model/avatar';

type Option = { id: string; label: string; fill?: string };
type Field = Exclude<keyof AvatarConfig, 'v'>;

// Seis abas cabem inteiras no celular; partes afins dividem a mesma aba.
const TABS = [
  { id: 'rosto', label: 'Rosto' },
  { id: 'cabelo', label: 'Cabelo' },
  { id: 'olhos', label: 'Olhos' },
  { id: 'expressao', label: 'Expressão' },
  { id: 'roupa', label: 'Roupa' },
  { id: 'fundo', label: 'Fundo' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Grupo de escolha única: setas movem a seleção, só o item marcado entra no Tab. */
function Choices({ label, options, value, onChange, swatch, render }: {
  label: string;
  options: readonly Option[];
  value: string;
  onChange: (id: string) => void;
  swatch?: boolean;
  render?: (id: string) => ReactNode;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = options.findIndex((o) => o.id === value);
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (idx + d + options.length) % options.length;
    onChange(options[n].id);
    refs.current[n]?.focus();
  };
  const current = options[idx]?.label;
  return (
    <div className="av-group">
      <div className="av-group-head">
        <span className="label">{label}</span>
        {current && <span className="tiny muted">{current}</span>}
      </div>
      <div role="radiogroup" aria-label={label} className={swatch ? 'av-swatches' : 'av-tiles'} onKeyDown={onKey}>
        {options.map((o, i) => {
          const on = o.id === value;
          return swatch ? (
            <button type="button" role="radio" aria-checked={on} aria-label={o.label} title={o.label} key={o.id}
              tabIndex={on ? 0 : -1} ref={(el) => { refs.current[i] = el; }}
              className={`av-swatch${on ? ' on' : ''}`} style={{ '--c': o.fill } as CSSProperties}
              onClick={() => onChange(o.id)} />
          ) : (
            <button type="button" role="radio" aria-checked={on} key={o.id}
              tabIndex={on ? 0 : -1} ref={(el) => { refs.current[i] = el; }}
              className={`av-tile${on ? ' on' : ''}`} onClick={() => onChange(o.id)}>
              {render?.(o.id)}
              <span className="av-tile-label">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EditorProps {
  initial?: AvatarConfig | null;
  name?: string;
  /** false mantém o editor aberto (ex.: a ação falhou). */
  onSave: (avatar: AvatarConfig) => Promise<boolean> | void;
  onClose: () => void;
}

export function AvatarEditor({ initial, name, onSave, onClose }: EditorProps) {
  const [start] = useState(() => sanitizeAvatar(initial));
  const [cfg, setCfg] = useState<AvatarConfig>(start);
  const [tab, setTab] = useState<TabId>('rosto');
  const [busy, setBusy] = useState(false);
  const changed = !sameAvatar(cfg, start);

  const set = (field: Field) => (id: string) => setCfg((c) => ({ ...c, [field]: id }));
  // Miniatura = o avatar inteiro com a opção aplicada: reconhecer é mais fácil que imaginar.
  const thumb = (field: Field, crop?: 'face') => (id: string) => (
    <Avatar config={{ ...cfg, [field]: id }} size={56} crop={crop} />
  );

  const save = async () => {
    if (!changed || busy) return;
    setBusy(true);
    const ok = await onSave(cfg);
    setBusy(false);
    if (ok !== false) onClose();
  };

  const onTabKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + d + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`av-tab-${next.id}`)?.focus();
  };

  return (
    <Modal open width={720} title={name ? `Aparência de ${name}` : 'Aparência'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" disabled={!changed || busy} onClick={() => setCfg(start)}>
          <RotateCcw size={14} /> Restaurar
        </button>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!changed || busy} onClick={() => void save()}>Salvar aparência</button>
      </>}>
      <div className="av-editor">
        <div className="av-stage">
          <Avatar config={cfg} size={160} label={`Prévia${name ? ` de ${name}` : ''}`} />
          {/* Ponto de partida rápido; "Restaurar" desfaz se o sorteio não agradar. */}
          <button type="button" className="btn btn-sm av-random" onClick={() => setCfg(randomAvatar())}>
            <Dices size={14} /> Aleatório
          </button>
        </div>
        <div className="av-panel">
          <div className="tabs av-tabs" role="tablist" aria-label="Partes" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button type="button" role="tab" id={`av-tab-${t.id}`} key={t.id} aria-selected={t.id === tab}
                tabIndex={t.id === tab ? 0 : -1} className={`tab${t.id === tab ? ' tab-active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="av-options" role="tabpanel" aria-labelledby={`av-tab-${tab}`}>
            {tab === 'rosto' && <>
              <Choices label="Tom de pele" options={SKINS} value={cfg.skin} onChange={set('skin')} swatch />
              <Choices label="Formato do rosto" options={FACES} value={cfg.face} onChange={set('face')} render={thumb('face', 'face')} />
              <Choices label="Nariz" options={NOSES} value={cfg.nose} onChange={set('nose')} render={thumb('nose', 'face')} />
            </>}
            {tab === 'cabelo' && <>
              <Choices label="Cor do cabelo" options={HAIR_COLORS} value={cfg.hairColor} onChange={set('hairColor')} swatch />
              <Choices label="Estilo" options={HAIRS} value={cfg.hair} onChange={set('hair')} render={thumb('hair')} />
              <Choices label="Barba" options={BEARDS} value={cfg.beard} onChange={set('beard')} render={thumb('beard', 'face')} />
            </>}
            {tab === 'olhos' && <>
              <Choices label="Cor dos olhos" options={EYE_COLORS} value={cfg.eyeColor} onChange={set('eyeColor')} swatch />
              <Choices label="Formato" options={EYES} value={cfg.eyes} onChange={set('eyes')} render={thumb('eyes', 'face')} />
            </>}
            {tab === 'expressao' && <>
              <Choices label="Sobrancelhas" options={BROWS} value={cfg.brows} onChange={set('brows')} render={thumb('brows', 'face')} />
              <Choices label="Boca" options={MOUTHS} value={cfg.mouth} onChange={set('mouth')} render={thumb('mouth', 'face')} />
            </>}
            {tab === 'roupa' && <Choices label="Roupa" options={OUTFITS} value={cfg.outfit} onChange={set('outfit')} render={thumb('outfit')} />}
            {tab === 'fundo' && <Choices label="Cor de fundo" options={BACKGROUNDS} value={cfg.bg} onChange={set('bg')} swatch />}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Avatar clicável que abre o editor; sem `onSave`, é só a imagem. */
export function EditableAvatar({ config, name, size = 72, onSave }: {
  config?: AvatarConfig | null;
  name: string;
  size?: number;
  onSave?: EditorProps['onSave'];
}) {
  const [open, setOpen] = useState(false);
  if (!onSave) return <Avatar config={config} size={size} label={name} />;
  return (
    <>
      <button type="button" className="av-edit" onClick={() => setOpen(true)} aria-label="Editar aparência" title="Editar aparência">
        <Avatar config={config} size={size} />
        <span className="av-edit-badge" aria-hidden><Pencil size={12} /></span>
      </button>
      {open && <AvatarEditor initial={config} name={name} onSave={onSave} onClose={() => setOpen(false)} />}
    </>
  );
}
