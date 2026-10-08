import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Minus, Plus, Send } from 'lucide-react';
import type { CharacterDraft, LevelPick } from '../../model/types';
import {
  ATTR_COST, ATTR_KEYS, ATTR_MAX, ATTR_MIN, ATTRIBUTES, POINT_BUDGET, emptyAttributes, fmtMod, pointsLeft,
} from '../../rules/attributes';
import { CLASS_IDS, CLASSES, MAX_LEVEL, type ClassId } from '../../rules/classes';
import { deriveStats } from '../../rules/derive';
import {
  abilityOptions, classesAvailable, LIMITS, resizeLevels, sanitizeLevels, validateDraft, validateLevelPick,
} from '../../rules/validate';
import AbilityCard from './AbilityCard';
import Avatar from '../common/Avatar';
import { EditableAvatar } from '../common/AvatarEditor';

// Páginas: 0 Conceito, 1 Atributos, 2 Classe (nível 1), 3 Habilidade (nível 1),
// depois uma página por nível acima do 1 e, por fim, a Revisão.
const FIRST_EXTRA = 4;

/**
 * `level`: nível fixo (o nível inicial da mesa, para jogadores).
 * `levelEditable`: o mestre escolhe o nível (NPC). Sem nenhum dos dois, vale o nível do `initial` (ou 1).
 */
export default function CharacterWizard({
  initial, onSubmit, onCancel, submitLabel = 'Enviar para o mestre', level, levelEditable = false,
}: {
  initial?: CharacterDraft;
  onSubmit: (d: CharacterDraft) => Promise<boolean>;
  onCancel?: () => void;
  submitLabel?: string;
  level?: number;
  levelEditable?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<CharacterDraft>(() => {
    const d = initial ?? { name: '', concept: '', notes: '', attributes: emptyAttributes(), levels: [{ classId: CLASS_IDS[0], abilityId: null }] };
    return { ...d, levels: resizeLevels(d.attributes, d.levels, level ?? d.levels.length) };
  });
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<CharacterDraft>) => setDraft((d) => ({ ...d, ...p }));
  const left = pointsLeft(draft.attributes);
  const total = draft.levels.length;
  const reviewPage = FIRST_EXTRA + total - 1;
  const first = draft.levels[0];

  const options = useMemo(() => abilityOptions(draft.attributes, [], first.classId), [draft.attributes, first.classId]);
  const preview = deriveStats({ attributes: draft.attributes, levels: draft.levels, permanentLoss: { pv: 0, pe: 0 } });

  /** Troca o nível `i` e reajusta os seguintes, que dependem dele. */
  const setPick = (i: number, pick: LevelPick) => {
    const levels = draft.levels.map((l, j) => (j === i ? pick : l));
    up({ levels: sanitizeLevels(draft.attributes, levels) });
  };

  const pageError = (p: number): string | null => {
    if (p === 0 && !draft.name.trim()) return 'Dê um nome ao personagem.';
    if (p === 1 && left < 0) return 'Pontos gastos além do limite.';
    if (p === 3) {
      const opt = options.find((o) => o.ability.id === first.abilityId);
      if (!opt || !opt.eligible) return 'Escolha uma habilidade disponível.';
    }
    if (p >= FIRST_EXTRA && p < reviewPage) {
      const i = p - FIRST_EXTRA + 1;
      return validateLevelPick(draft.attributes, draft.levels.slice(0, i), draft.levels[i]);
    }
    return null;
  };
  const err = pageError(page);

  const setAttr = (k: (typeof ATTR_KEYS)[number], v: number) => {
    const attributes = { ...draft.attributes, [k]: v };
    // Habilidade que deixou de cumprir requisito (ex.: Violência sem FOR 1+) é desmarcada.
    up({ attributes, levels: sanitizeLevels(attributes, draft.levels) });
  };

  const setLevel = (n: number) => up({ levels: resizeLevels(draft.attributes, draft.levels, n) });

  // O mestre mudou o nível inicial da mesa com o assistente aberto.
  useEffect(() => {
    if (level === undefined) return;
    setDraft((d) => (d.levels.length === level ? d : { ...d, levels: resizeLevels(d.attributes, d.levels, level) }));
    setPage((p) => Math.min(p, FIRST_EXTRA + level - 1));
  }, [level]);

  const draftError = validateDraft(draft, level);
  const submit = async () => {
    if (draftError) return;
    setBusy(true);
    try { await onSubmit(draft); } finally { setBusy(false); }
  };

  const steps = ['Conceito', 'Atributos', 'Classe', 'Habilidade', ...(total > 1 ? [total === 2 ? 'Nível 2' : `Níveis 2–${total}`] : []), 'Revisão'];
  const step = page < FIRST_EXTRA ? page : page < reviewPage ? FIRST_EXTRA : steps.length - 1;

  return (
    <div className="card card-gold">
      <div className="steps">
        {steps.map((s, i) => (
          <span key={s} className={`step${i === step ? ' step-active' : i < step ? ' step-done' : ''}`}>{i + 1}. {s}</span>
        ))}
      </div>

      {page === 0 && (
        <div className="col gap-lg">
          <div className="av-inline">
            <EditableAvatar config={draft.avatar} name={draft.name.trim() || 'personagem'} onSave={(avatar) => up({ avatar })} />
            <div className="field grow">
              <label className="label" htmlFor="wiz-name">Nome do personagem</label>
              <input id="wiz-name" className="input" autoFocus value={draft.name} maxLength={LIMITS.name} onChange={(e) => up({ name: e.target.value })} />
              <span className="tiny muted">Toque no retrato para montar a aparência.</span>
            </div>
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
          {levelEditable ? (
            <div className="field">
              <label className="label">Nível</label>
              <div className="row">
                <div className="stepper">
                  <button className="btn btn-sm btn-icon" disabled={total <= 1} onClick={() => setLevel(total - 1)} aria-label="Diminuir nível"><Minus size={14} /></button>
                  <span className="val">{total}</span>
                  <button className="btn btn-sm btn-icon" disabled={total >= MAX_LEVEL} onClick={() => setLevel(total + 1)} aria-label="Aumentar nível"><Plus size={14} /></button>
                </div>
                <span className="tiny muted">As habilidades seguem a progressão: classe e habilidade de cada nível, do 1 ao {total}.</span>
              </div>
            </div>
          ) : total > 1 && (
            <p className="small secondary">
              Personagens desta mesa começam no <strong>nível {total}</strong>. Você escolhe a classe e a habilidade de cada nível, um de cada vez.
            </p>
          )}
        </div>
      )}

      {page === 1 && (
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

      {page === 2 && (
        <div className="grid-2">
          {CLASS_IDS.map((c) => {
            const info = CLASSES[c];
            const sel = first.classId === c;
            const pv = Math.max(1, info.pvInitial + draft.attributes.CON);
            return (
              <button key={c} className={`card card-hover${sel ? ' card-selected' : ''}`} style={{ textAlign: 'left' }}
                onClick={() => setPick(0, { classId: c as ClassId, abilityId: sel ? first.abilityId : null })}>
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

      {page === 3 && (
        <div className="col">
          <p className="small secondary mb">Escolha 1 habilidade de {CLASSES[first.classId].name}. A cada nível você escolhe outra.</p>
          {options.map((o) => (
            <AbilityCard key={o.ability.id} ability={o.ability} disabledReason={o.eligible ? undefined : o.reason}
              selected={first.abilityId === o.ability.id} onSelect={() => setPick(0, { ...first, abilityId: o.ability.id })} />
          ))}
        </div>
      )}

      {page >= FIRST_EXTRA && page < reviewPage && (
        <LevelPage index={page - FIRST_EXTRA + 1} draft={draft} onPick={setPick} />
      )}

      {page === reviewPage && (
        <div className="col gap-lg">
          <div className="av-inline">
            <Avatar config={draft.avatar} size={56} />
            <div>
              <div className="sheet-title">{preview.title} · Nível {total}</div>
              <h2 className="sheet-name">{draft.name}</h2>
              {draft.concept && <div className="secondary">{draft.concept}</div>}
            </div>
          </div>
          <div className="stats">
            <div className="stat"><span className="stat-val" style={{ color: 'var(--pv)' }}>{preview.pvMax}</span><span className="stat-lbl">PV</span></div>
            <div className="stat"><span className="stat-val" style={{ color: 'var(--pe)' }}>{preview.peMax}</span><span className="stat-lbl">PE</span></div>
            <div className="stat"><span className="stat-val" style={{ color: 'var(--clareza)' }}>{preview.clarezaMax}</span><span className="stat-lbl">Clareza</span></div>
            <div className="stat"><span className="stat-val">{preview.def}</span><span className="stat-lbl">Defesa</span></div>
            <div className="stat"><span className="stat-val">{preview.von}</span><span className="stat-lbl">Vontade</span></div>
          </div>
          <div className="attrs">
            {ATTR_KEYS.map((k) => (
              <div key={k} className="attr"><span className="attr-key">{ATTRIBUTES[k].short}</span><span className="attr-val">{fmtMod(draft.attributes[k])}</span></div>
            ))}
          </div>
          {total > 1 && (
            <div className="row-wrap">
              {preview.classes.map((c) => (
                <span key={c} className="class-chip" style={{ color: CLASSES[c].color, borderColor: CLASSES[c].color }}>{CLASSES[c].name} {preview.classLevels[c]}</span>
              ))}
            </div>
          )}
          {preview.abilities.map((a) => <AbilityCard key={a.id} ability={a} defaultOpen={preview.abilities.length === 1} />)}
          {draftError && <p className="small" style={{ color: 'var(--error)' }}>{draftError}</p>}
        </div>
      )}

      <div className="row mt" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        {page > 0 ? (
          <button className="btn" onClick={() => setPage(page - 1)}><ArrowLeft size={14} /> Voltar</button>
        ) : onCancel ? <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button> : null}
        <div className="spacer" />
        {err && <span className="small muted">{err}</span>}
        {page < reviewPage ? (
          <button className="btn btn-primary" disabled={!!err} onClick={() => setPage(page + 1)}>Próximo <ArrowRight size={14} /></button>
        ) : (
          <button className="btn btn-primary" disabled={busy || !!draftError} onClick={submit}><Send size={14} /> {submitLabel}</button>
        )}
      </div>
    </div>
  );
}

/** Um nível acima do 1: classe e habilidade, com as opções liberadas pelos níveis anteriores. */
function LevelPage({ index, draft, onPick }: { index: number; draft: CharacterDraft; onPick: (i: number, pick: LevelPick) => void }) {
  const prev = draft.levels.slice(0, index);
  const pick = draft.levels[index];
  const available = classesAvailable(prev);
  const before = deriveStats({ attributes: draft.attributes, levels: prev, permanentLoss: { pv: 0, pe: 0 } });
  const options = abilityOptions(draft.attributes, prev, pick.classId);
  const eligible = options.filter((o) => o.eligible);

  return (
    <div className="col gap-lg">
      <div>
        <h3>Nível {index + 1} <span className="muted small">de {draft.levels.length}</span></h3>
        <div className="tiny muted">Até aqui: {before.classes.map((c) => `${CLASSES[c].name} ${before.classLevels[c]}`).join(' · ')}</div>
      </div>
      <div>
        <label className="label">Classe que recebe o nível {available.length < CLASS_IDS.length && <span className="muted">(máximo de 2 classes)</span>}</label>
        <div className="grid-2">
          {available.map((c) => (
            <button key={c} className={`card card-hover${c === pick.classId ? ' card-selected' : ''}`} style={{ textAlign: 'left', padding: 12 }}
              onClick={() => { if (c !== pick.classId) onPick(index, { classId: c, abilityId: null }); }}>
              <div className="row"><strong style={{ color: CLASSES[c].color }}>{CLASSES[c].name}</strong>
                <span className="spacer" /><span className="tiny muted">nível {before.classLevels[c]} → {before.classLevels[c] + 1}</span></div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Habilidade</label>
        {eligible.length === 0 && <div className="empty small">Nenhuma habilidade disponível nesta classe agora. O nível vem sem habilidade.</div>}
        <div className="col">
          {options.map((o) => (
            <AbilityCard key={o.ability.id} ability={o.ability} disabledReason={o.eligible ? undefined : o.reason}
              selected={pick.abilityId === o.ability.id} onSelect={() => onPick(index, { ...pick, abilityId: o.ability.id })} />
          ))}
        </div>
      </div>
    </div>
  );
}
