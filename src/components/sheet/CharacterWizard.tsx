import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Minus, Plus, Send } from 'lucide-react';
import type { CharacterDraft, LevelPick } from '../../model/types';
import {
  ATTR_COST, ATTR_KEYS, ATTR_MAX, ATTR_MIN, ATTRIBUTES, POINT_BUDGET, emptyAttributes, fmtMod, pointsLeft,
  type Attributes,
} from '../../rules/attributes';
import {
  CLASS_IDS, CLASSES, MAX_LEVEL, SPECIALIST_LEVEL, isSpecialist, specialistFor, type BaseClassId, type ClassId,
} from '../../rules/classes';
import { getAbility } from '../../rules/abilities';
import { baseClassOrder, deriveStats, specialistOf } from '../../rules/derive';
import { checkOptions, firstInvalidLevel, LIMITS, levelsFromChecks, validateDraft } from '../../rules/validate';
import AbilityCard from './AbilityCard';
import ClassName, { TitleText } from '../common/ClassName';
import Avatar from '../common/Avatar';
import { EditableAvatar } from '../common/AvatarEditor';

// Páginas: 0 Conceito, 1 Atributos, 2 Classe (a do nível 1), 3 Habilidades (todas
// de uma vez, uma por nível) e 4 Revisão.
const ABILITY_PAGE = 3;
const REVIEW_PAGE = 4;

const checksOf = (levels: LevelPick[]) => levels.map((l) => l.abilityId).filter((id): id is string => !!id);
const classOfAbility = (id: string) => getAbility(id)?.classId;
const isSpecialistAbility = (id: string) => { const c = classOfAbility(id); return !!c && isSpecialist(c); };
const primaryOf = (levels: LevelPick[]) => levels[0].classId as BaseClassId;

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
    return { ...d, levels: levelsFromChecks(d.attributes, primaryOf(d.levels), checksOf(d.levels), level ?? d.levels.length) };
  });
  // Segunda classe escolhida, mesmo antes de marcar alguma habilidade dela.
  const [second, setSecond] = useState<BaseClassId | null>(() => baseClassOrder(draft.levels)[1] ?? null);
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<CharacterDraft>) => setDraft((d) => ({ ...d, ...p }));
  const left = pointsLeft(draft.attributes);
  const total = draft.levels.length;
  const primary = primaryOf(draft.levels);
  const checked = checksOf(draft.levels);
  // Acima do nível 9, a classe especialista da combinação fica com os níveis 10 em diante.
  const spec = total > SPECIALIST_LEVEL ? specialistFor(primary, second ?? primary) : null;
  const specSlots = spec ? total - SPECIALIST_LEVEL : 0;
  const baseSlots = total - specSlots;
  const specChecked = checked.filter(isSpecialistAbility);
  const baseChecked = checked.filter((id) => !isSpecialistAbility(id));
  const missing = total - checked.length;
  const levelsError = firstInvalidLevel(draft.attributes, draft.levels);

  const preview = deriveStats({ attributes: draft.attributes, levels: draft.levels, permanentLoss: { pv: 0, pe: 0 } });

  /** Remonta os níveis pelas habilidades marcadas (o que deixou de valer é desmarcado em cascata). */
  const setChecks = (ids: string[], p: BaseClassId = primary, attributes: Attributes = draft.attributes, n = total) =>
    up({ attributes, levels: levelsFromChecks(attributes, p, ids, n) });

  const toggle = (id: string) => {
    if (total === 1) setChecks([id]);
    else if (checked.includes(id)) setChecks(checked.filter((x) => x !== id));
    else if (isSpecialistAbility(id) ? specChecked.length < specSlots : baseChecked.length < baseSlots) setChecks([...checked, id]);
  };

  const choosePrimary = (c: BaseClassId) => {
    if (c === primary) return;
    // Trocar pela segunda classe só inverte as duas; outra classe descarta as habilidades da anterior
    // (e as da especialista, que muda com a combinação).
    if (c === second) { setSecond(primary); setChecks(checked, c); return; }
    setChecks(checked.filter((id) => classOfAbility(id) !== primary && !isSpecialistAbility(id)), c);
  };

  const chooseSecond = (c: BaseClassId | null) => {
    if (c === second) return;
    setSecond(c);
    setChecks(checked.filter((id) => classOfAbility(id) === primary));
  };

  const pageError = (p: number): string | null => {
    if (p === 0 && !draft.name.trim()) return 'Dê um nome ao personagem.';
    if (p === 1 && left < 0) return 'Pontos gastos além do limite.';
    if (p === ABILITY_PAGE && levelsError) {
      if (missing <= 0) return levelsError.error;
      if (total === 1) return 'Escolha uma habilidade disponível.';
      return `Marque mais ${missing} habilidade${missing > 1 ? 's' : ''}.`;
    }
    return null;
  };
  const err = pageError(page);

  const setAttr = (k: (typeof ATTR_KEYS)[number], v: number) => {
    // Habilidade que deixou de cumprir requisito (ex.: Violência sem FOR 1+) é desmarcada.
    setChecks(checked, primary, { ...draft.attributes, [k]: v });
  };

  const setLevel = (n: number) => setChecks(checked, primary, draft.attributes, n);

  // O mestre mudou o nível inicial da mesa com o assistente aberto.
  useEffect(() => {
    if (level === undefined) return;
    setDraft((d) => (d.levels.length === level ? d : {
      ...d, levels: levelsFromChecks(d.attributes, primaryOf(d.levels), checksOf(d.levels), level),
    }));
  }, [level]);

  const draftError = validateDraft(draft, level);
  const submit = async () => {
    if (draftError) return;
    setBusy(true);
    try { await onSubmit(draft); } finally { setBusy(false); }
  };

  const steps = ['Conceito', 'Atributos', 'Classe', total > 1 ? 'Habilidades' : 'Habilidade', 'Revisão'];
  const primaryCount = checked.filter((id) => classOfAbility(id) === primary).length;

  return (
    <div className="card card-gold">
      <div className="steps">
        {steps.map((s, i) => (
          <span key={s} className={`step${i === page ? ' step-active' : i < page ? ' step-done' : ''}`}>{i + 1}. {s}</span>
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
                <span className="tiny muted">Uma habilidade por nível: você marca {total} de uma vez.</span>
              </div>
            </div>
          ) : total > 1 && (
            <p className="small secondary">
              Personagens desta mesa começam no <strong>nível {total}</strong>. Você escolhe a classe inicial e marca as {total} habilidades de uma vez.
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
        <div className="col">
          {total > 1 && <p className="small secondary mb">Classe do 1º nível. Uma segunda classe pode ser escolhida na próxima etapa.</p>}
          <div className="grid-2">
            {CLASS_IDS.map((c) => {
              const info = CLASSES[c];
              const sel = primary === c;
              const pv = Math.max(1, info.pvInitial + draft.attributes.CON);
              return (
                <button key={c} className={`card card-hover${sel ? ' card-selected' : ''}`} style={{ textAlign: 'left' }}
                  onClick={() => choosePrimary(c)}>
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
        </div>
      )}

      {page === ABILITY_PAGE && (
        <div className="col gap-lg">
          {total === 1 ? (
            <p className="small secondary">Escolha 1 habilidade de {CLASSES[primary].name}. A cada nível você escolhe outra.</p>
          ) : (
            <p className="small secondary">
              Marque {total} habilidades, uma por nível: <strong className="gold">{checked.length} de {total}</strong>.
              {' '}As de 3º nível pedem 2 habilidades de nível menor marcadas na mesma classe; as de 6º, 5; as de 9º, 8.
              {spec && <> Os níveis {SPECIALIST_LEVEL + 1} a {total} vão para a classe especialista: {baseSlots} habilidades das classes base e {specSlots} de {CLASSES[spec].name}.</>}
            </p>
          )}
          <ClassChecklist classId={primary} attributes={draft.attributes} checked={checked} multi={total > 1} full={baseChecked.length >= baseSlots} onToggle={toggle} />
          {total > 1 && (
            <div>
              <label className="label">Segunda classe <span className="muted">(opcional, máximo de 2 classes)</span></label>
              <div className="chips">
                <button className={`chip${second ? '' : ' on'}`} onClick={() => chooseSecond(null)}>Nenhuma</button>
                {CLASS_IDS.filter((c) => c !== primary).map((c) => (
                  <button key={c} className={`chip${second === c ? ' on' : ''}`} onClick={() => chooseSecond(c)}>
                    <span className="chip-dot" style={{ background: CLASSES[c].color }} />{CLASSES[c].name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {total > 1 && second && (
            <ClassChecklist classId={second} attributes={draft.attributes} checked={checked} multi full={baseChecked.length >= baseSlots} onToggle={toggle}
              lockReason={primaryCount ? undefined : `Marque antes uma de ${CLASSES[primary].name}`} />
          )}
          {spec && (
            <ClassChecklist classId={spec} attributes={draft.attributes} checked={checked} multi full={specChecked.length >= specSlots} onToggle={toggle}
              subtitle={`Classe especialista · níveis ${SPECIALIST_LEVEL + 1} a ${total}`}
              lockReason={specialistOf(draft.levels.slice(0, SPECIALIST_LEVEL)) === spec ? undefined : `Marque antes uma de ${CLASSES[second ?? primary].name}`} />
          )}
          {total > SPECIALIST_LEVEL && !spec && (
            <p className="small secondary">
              A classe especialista de {second ? `${CLASSES[primary].name} com ${CLASSES[second].name}` : CLASSES[primary].name} ainda não existe nas regras: os níveis {SPECIALIST_LEVEL + 1} a {total} continuam nas classes base.
            </p>
          )}
          {missing > 0 && !levelsError && (
            <p className="small secondary">
              Não há mais habilidades de {CLASSES[primary].name} para marcar: {missing === 1 ? 'o nível restante vem' : `os ${missing} níveis restantes vêm`} sem habilidade
              {second ? '.' : ' (ou escolha uma segunda classe).'}
            </p>
          )}
        </div>
      )}

      {page === REVIEW_PAGE && (
        <div className="col gap-lg">
          <div className="av-inline">
            <Avatar config={draft.avatar} size={56} />
            <div>
              <div className="sheet-title"><TitleText d={preview} /> · Nível {total}</div>
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
                <span key={c} className="class-chip" style={{ color: CLASSES[c].color, borderColor: CLASSES[c].color }}><ClassName id={c} /> {preview.classLevels[c]}</span>
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
        {page < REVIEW_PAGE ? (
          <button className="btn btn-primary" disabled={!!err} onClick={() => setPage(page + 1)}>Próximo <ArrowRight size={14} /></button>
        ) : (
          <button className="btn btn-primary" disabled={busy || !!draftError} onClick={submit}><Send size={14} /> {submitLabel}</button>
        )}
      </div>
    </div>
  );
}

/** Habilidades de uma classe para marcar. As que podem ser marcadas (e as marcadas) ficam abertas. */
function ClassChecklist({ classId, attributes, checked, multi = false, full = false, subtitle, lockReason, onToggle }: {
  classId: ClassId;
  attributes: Attributes;
  checked: string[];
  /** Caixas de marcar; sem isso é escolha única (marcar outra troca a escolhida). */
  multi?: boolean;
  /** Não cabe mais nenhuma habilidade deste grupo (só vale com `multi`). */
  full?: boolean;
  subtitle?: string;
  /** Bloqueia tudo que não está marcado (ex.: segunda classe antes da inicial). */
  lockReason?: string;
  onToggle: (id: string) => void;
}) {
  const options = checkOptions(attributes, classId, checked);
  const count = options.filter((o) => checked.includes(o.ability.id)).length;
  const isFull = multi && full;
  return (
    <div className="col">
      <div className="row">
        <h3><ClassName id={classId} /></h3>
        {subtitle && <span className="tiny muted">{subtitle}</span>}
        <span className="spacer" />
        {multi && <span className="tiny muted">{count} marcada{count === 1 ? '' : 's'}</span>}
      </div>
      {options.map((o) => {
        const on = checked.includes(o.ability.id);
        const reason = on ? undefined : !o.eligible ? o.reason : lockReason ?? (isFull ? 'Limite de habilidades atingido' : undefined);
        return (
          <AbilityCard key={o.ability.id} ability={o.ability} multi={multi} disabledReason={reason} defaultOpen={!reason}
            selected={on} onSelect={() => onToggle(o.ability.id)} />
        );
      })}
    </div>
  );
}
