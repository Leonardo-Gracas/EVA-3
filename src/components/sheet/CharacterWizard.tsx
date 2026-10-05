import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Minus, Plus, Send } from 'lucide-react';
import type { CharacterDraft } from '../../model/types';
import {
  ATTR_COST, ATTR_KEYS, ATTR_MAX, ATTR_MIN, ATTRIBUTES, POINT_BUDGET, emptyAttributes, fmtMod, pointsLeft,
} from '../../rules/attributes';
import { CLASS_IDS, CLASSES, type ClassId } from '../../rules/classes';
import { deriveStats } from '../../rules/derive';
import { abilityOptions, LIMITS, validateDraft } from '../../rules/validate';
import AbilityCard from './AbilityCard';

const STEPS = ['Conceito', 'Atributos', 'Classe', 'Habilidade', 'Revisão'];

export default function CharacterWizard({
  initial, onSubmit, onCancel, submitLabel = 'Enviar para o mestre',
}: {
  initial?: CharacterDraft;
  onSubmit: (d: CharacterDraft) => Promise<boolean>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CharacterDraft>(
    initial ?? { name: '', concept: '', notes: '', attributes: emptyAttributes(), classId: 'combatente', abilityId: null },
  );
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<CharacterDraft>) => setDraft((d) => ({ ...d, ...p }));
  const left = pointsLeft(draft.attributes);

  const options = useMemo(() => abilityOptions(draft.attributes, [], draft.classId), [draft.attributes, draft.classId]);
  const preview = deriveStats({
    attributes: draft.attributes,
    levels: [{ classId: draft.classId, abilityId: draft.abilityId }],
    permanentLoss: { pv: 0, pe: 0 },
  });

  const stepError = (s: number): string | null => {
    if (s === 0 && !draft.name.trim()) return 'Dê um nome ao personagem.';
    if (s === 1 && left < 0) return 'Pontos gastos além do limite.';
    if (s === 3) {
      const opt = options.find((o) => o.ability.id === draft.abilityId);
      if (!opt || !opt.eligible) return 'Escolha uma habilidade disponível.';
    }
    return null;
  };
  const err = stepError(step);

  const setAttr = (k: (typeof ATTR_KEYS)[number], v: number) => {
    const attributes = { ...draft.attributes, [k]: v };
    // Habilidade que deixou de cumprir requisito (ex.: Violência sem FOR 1+) é desmarcada.
    const still = abilityOptions(attributes, [], draft.classId).find((o) => o.ability.id === draft.abilityId)?.eligible;
    up({ attributes, abilityId: still ? draft.abilityId : null });
  };

  const submit = async () => {
    if (validateDraft(draft)) return;
    setBusy(true);
    try { await onSubmit(draft); } finally { setBusy(false); }
  };

  return (
    <div className="card card-gold">
      <div className="steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`step${i === step ? ' step-active' : i < step ? ' step-done' : ''}`}>{i + 1}. {s}</span>
        ))}
      </div>

      {step === 0 && (
        <div className="col gap-lg">
          <div className="field">
            <label className="label">Nome do personagem</label>
            <input className="input" autoFocus value={draft.name} maxLength={LIMITS.name} onChange={(e) => up({ name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Conceito (uma linha)</label>
            <input className="input" value={draft.concept} maxLength={LIMITS.concept} placeholder="Ex.: Padre exilado que ouve vozes"
              onChange={(e) => up({ concept: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">História e aparência (opcional)</label>
            <textarea className="textarea" value={draft.notes} maxLength={LIMITS.notes} onChange={(e) => up({ notes: e.target.value })} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="col gap-lg">
          <div className="row">
            <div>
              <div className="points-left">{left}</div>
              <div className="tiny muted">de {POINT_BUDGET} pontos restantes</div>
            </div>
            <div className="spacer" />
            <div className="tiny muted" style={{ textAlign: 'right' }}>
              Custo: {Object.entries(ATTR_COST).sort((a, b) => +a[0] - +b[0]).map(([v, c]) => `${fmtMod(+v)} = ${c > 0 ? '−' : c < 0 ? '+' : ''}${Math.abs(c)}`).join(' · ')}
            </div>
          </div>
          <div className="pointbuy">
            {ATTR_KEYS.map((k) => (
              <div key={k} style={{ display: 'contents' }}>
                <div>
                  <strong className="gold">{ATTRIBUTES[k].short}</strong> <span>{ATTRIBUTES[k].name}</span>
                  <div className="tiny muted">{ATTRIBUTES[k].description}</div>
                </div>
                <div className="stepper">
                  <button className="btn btn-sm btn-icon" disabled={draft.attributes[k] <= ATTR_MIN} onClick={() => setAttr(k, draft.attributes[k] - 1)} aria-label={`Diminuir ${k}`}><Minus size={14} /></button>
                  <span className="val">{fmtMod(draft.attributes[k])}</span>
                  <button className="btn btn-sm btn-icon"
                    disabled={draft.attributes[k] >= ATTR_MAX || left - (ATTR_COST[draft.attributes[k] + 1] - ATTR_COST[draft.attributes[k]]) < 0}
                    onClick={() => setAttr(k, draft.attributes[k] + 1)} aria-label={`Aumentar ${k}`}><Plus size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <p className="small" style={{ color: 'var(--warning)' }}>Atribua com sabedoria: os atributos não podem ser alterados após a aprovação da ficha.</p>
        </div>
      )}

      {step === 2 && (
        <div className="grid-2">
          {CLASS_IDS.map((c) => {
            const info = CLASSES[c];
            const sel = draft.classId === c;
            const pv = Math.max(1, info.pvInitial + draft.attributes.CON);
            return (
              <button key={c} className={`card card-hover${sel ? ' card-selected' : ''}`} style={{ textAlign: 'left' }}
                onClick={() => up({ classId: c as ClassId, abilityId: draft.classId === c ? draft.abilityId : null })}>
                <h3 style={{ color: info.color }}>{info.name}</h3>
                <p className="small secondary" style={{ margin: '6px 0' }}>{info.description}</p>
                <p className="tiny gold" style={{ fontStyle: 'italic' }}>{info.tagline}</p>
                <div className="row-wrap mt small">
                  <span className="badge">PV {pv} · +{info.pvPerLevel} + CON/nível</span>
                  <span className="badge">PE {info.peInitial} · +{info.pePerLevel}{info.peAttr ? ` + ${ATTRIBUTES[info.peAttr].short}` : ''}/nível</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {step === 3 && (
        <div className="col">
          <p className="small secondary mb">Escolha 1 habilidade de {CLASSES[draft.classId].name}. A cada nível você escolhe outra.</p>
          {options.map((o) => (
            <AbilityCard key={o.ability.id} ability={o.ability} disabledReason={o.eligible ? undefined : o.reason}
              selected={draft.abilityId === o.ability.id} onSelect={() => up({ abilityId: o.ability.id })} />
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="col gap-lg">
          <div>
            <div className="sheet-title">{preview.title} · Nível 1</div>
            <h2 className="sheet-name">{draft.name}</h2>
            {draft.concept && <div className="secondary">{draft.concept}</div>}
          </div>
          <div className="stats">
            <div className="stat"><span className="stat-val" style={{ color: 'var(--pv)' }}>{preview.pvMax}</span><span className="stat-lbl">PV</span></div>
            <div className="stat"><span className="stat-val" style={{ color: 'var(--pe)' }}>{preview.peMax}</span><span className="stat-lbl">PE</span></div>
            <div className="stat"><span className="stat-val">{preview.def}</span><span className="stat-lbl">Defesa</span></div>
            <div className="stat"><span className="stat-val">{preview.von}</span><span className="stat-lbl">Vontade</span></div>
          </div>
          <div className="attrs">
            {ATTR_KEYS.map((k) => (
              <div key={k} className="attr"><span className="attr-key">{ATTRIBUTES[k].short}</span><span className="attr-val">{fmtMod(draft.attributes[k])}</span></div>
            ))}
          </div>
          {preview.abilities[0] && <AbilityCard ability={preview.abilities[0]} defaultOpen />}
          {validateDraft(draft) && <p className="small" style={{ color: 'var(--error)' }}>{validateDraft(draft)}</p>}
        </div>
      )}

      <div className="row mt" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        {step > 0 ? (
          <button className="btn" onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Voltar</button>
        ) : onCancel ? <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button> : null}
        <div className="spacer" />
        {err && <span className="small muted">{err}</span>}
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" disabled={!!err} onClick={() => setStep(step + 1)}>Próximo <ArrowRight size={14} /></button>
        ) : (
          <button className="btn btn-primary" disabled={busy || !!validateDraft(draft)} onClick={submit}><Send size={14} /> {submitLabel}</button>
        )}
      </div>
    </div>
  );
}
