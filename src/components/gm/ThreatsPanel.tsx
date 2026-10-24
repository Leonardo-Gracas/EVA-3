import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ArrowLeft, Copy, Dices, Eye, EyeOff, Heart, Pencil, Plus, Swords, Trash2, Zap } from 'lucide-react';
import { THREAT_CATEGORIES, type CombatThreat, type TableState, type Threat, type ThreatCategory } from '../../model/types';
import { ATTR_KEYS, ATTRIBUTES, fmtMod } from '../../rules/attributes';
import { parseExpr } from '../../rules/dice';
import { useAct } from '../act';
import { cancelRollFx, startRollFx } from '../RollFx';
import ConfirmButton from '../common/ConfirmButton';
import { Chip, FilterBar, FilterGroup, QuickFilter, SearchInput, SortSelect, matchesQuery, toggleIn } from '../common/Filters';
import ResourceAdjustModal, { peOps, pvOps, type AdjustStart, type AdjustTrack } from '../common/ResourceAdjust';
import ThreatEditor from './ThreatEditor';
import ThreatIcon, { ThreatGlyph } from './ThreatIcon';

const CATEGORY_ORDER = Object.keys(THREAT_CATEGORIES) as ThreatCategory[];

function pct(v: number, max: number) {
  return `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
}

type Trait = 'pe' | 'habilidades' | 'rd';
type Vis = 'visiveis' | 'ocultas';
type Sort = 'nome' | 'recentes' | 'pv' | 'def' | 'ataque';

const TRAITS: Array<{ id: Trait; label: string; title: string; test: (t: Threat) => boolean }> = [
  { id: 'pe', label: 'Usa PE', title: 'Tem PE máximo acima de 0', test: (t) => t.peMax > 0 },
  { id: 'habilidades', label: 'Com habilidades', title: 'Tem ao menos uma habilidade', test: (t) => t.abilities.length > 0 },
  { id: 'rd', label: 'Com RD', title: 'RD física ou mágica acima de 0', test: (t) => t.rdPhysical > 0 || t.rdMagic > 0 },
];

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'nome', label: 'Nome' },
  { id: 'recentes', label: 'Mais recentes' },
  { id: 'pv', label: 'Mais PV' },
  { id: 'def', label: 'Maior Defesa' },
  { id: 'ataque', label: 'Maior ataque' },
];

const bestAttack = (t: Threat) => t.attacks.reduce((m, a) => Math.max(m, a.bonus), -Infinity);
const byName = (a: Threat, b: Threat) => a.name.localeCompare(b.name, 'pt-BR');

/**
 * Livro de ameaças do mestre: moldes instanciáveis (cada combate cria cópias com PV/PE próprios),
 * então a grade mostra os números do molde para consulta rápida, sem barras.
 * Abrir um cartão mostra a ficha; tocar de novo na aba ou em "Ameaças" (ou "Todas as ameaças") volta à grade.
 */
export default function ThreatsPanel({ table, detailOpen, setDetailOpen }: {
  table: TableState; detailOpen: boolean; setDetailOpen: (open: boolean) => void;
}) {
  const { act } = useAct();
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [traits, setTraits] = useState<Trait[]>([]);
  const [vis, setVis] = useState<Vis[]>([]);
  const [cat, setCat] = useState<ThreatCategory | null>(null);
  const [sort, setSort] = useState<Sort>('nome');

  const all = useMemo(() => Object.values(table.threats), [table.threats]);
  const catCounts = useMemo(() => CATEGORY_ORDER
    .map((id) => ({ id, label: THREAT_CATEGORIES[id].plural, count: all.filter((t) => t.category === id).length, icon: <ThreatGlyph category={id} size={13} /> }))
    .filter((x) => x.count > 0), [all]);
  const threats = useMemo(() => {
    const tests = TRAITS.filter((x) => traits.includes(x.id)).map((x) => x.test);
    const out = all.filter((t) => tests.every((fn) => fn(t))
      && (!cat || t.category === cat)
      && (!vis.length || vis.includes(t.visible ? 'visiveis' : 'ocultas'))
      && matchesQuery(q, t.name, t.concept, t.notes, ...t.attacks.flatMap((a) => [a.name, a.damage, a.notes]), ...t.abilities.flatMap((h) => [h.name, h.text])));
    switch (sort) {
      case 'recentes': return out.sort((a, b) => b.createdAt - a.createdAt);
      case 'pv': return out.sort((a, b) => b.pvMax - a.pvMax || byName(a, b));
      case 'def': return out.sort((a, b) => b.def - a.def || byName(a, b));
      case 'ataque': return out.sort((a, b) => bestAttack(b) - bestAttack(a) || byName(a, b));
      default: return out.sort(byName);
    }
  }, [all, q, traits, vis, cat, sort]);

  const threat = selId ? table.threats[selId] : undefined;
  // Ficha excluída (ou nenhuma escolhida): volta à grade.
  useEffect(() => { if (detailOpen && !threat) setDetailOpen(false); }, [detailOpen, threat, setDetailOpen]);

  const open = (id: string) => { setSelId(id); setDetailOpen(true); window.scrollTo({ top: 0 }); };
  const back = () => { setDetailOpen(false); window.scrollTo({ top: 0 }); };

  const active = !!q.trim() || traits.length > 0 || vis.length > 0 || !!cat;
  const clear = () => { setQ(''); setTraits([]); setVis([]); setCat(null); };
  const visCount = (v: Vis) => all.filter((t) => t.visible === (v === 'visiveis')).length;

  const editor = creating && (
    <ThreatEditor title="Nova ameaça" onClose={() => setCreating(false)}
      onSave={async (data) => {
        const r = await act({ type: 'threat/upsert', data }, 'Ameaça criada.');
        if (r.ok && r.id) open(r.id);
        return r.ok;
      }} />
  );

  if (detailOpen && threat) {
    return (
      <div className="threat-detail">
        <button className="btn btn-sm btn-ghost threat-back" onClick={back}><ArrowLeft size={14} /> Todas as ameaças</button>
        <ThreatSheet t={threat} onDuplicated={open} />
        {editor}
      </div>
    );
  }

  const createBtn = (
    <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)} title="Nova ameaça" aria-label="Nova ameaça">
      <Plus size={13} /><span className="hide-xs">Nova ameaça</span>
    </button>
  );

  return (
    <div className="col gap-lg">
      {/* Nome e total ficam na sub-navegação da aba. */}
      {all.length === 0 && <div className="row"><span className="spacer" />{createBtn}</div>}
      {all.length > 0 && (
        <FilterBar active={active} shown={threats.length} total={all.length} onClear={clear} noun={['ameaça', 'ameaças']}
          filterCount={traits.length + vis.length} action={createBtn}
          search={<SearchInput value={q} onChange={setQ} placeholder="Buscar ameaça" />}
          quick={catCounts.length > 1 && <QuickFilter label="Categoria" value={cat} onChange={setCat} total={all.length} options={catCounts} />}
          sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}>
          <FilterGroup label="Mostrar">
            {TRAITS.map((x) => (
              <Chip key={x.id} on={traits.includes(x.id)} title={x.title} count={all.filter(x.test).length}
                onClick={() => setTraits((l) => toggleIn(l, x.id))}>{x.label}</Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Jogadores">
            <Chip on={vis.includes('visiveis')} count={visCount('visiveis')} title="Nome e descrição aparecem aos jogadores" onClick={() => setVis((l) => toggleIn(l, 'visiveis'))}>Visíveis</Chip>
            <Chip on={vis.includes('ocultas')} count={visCount('ocultas')} onClick={() => setVis((l) => toggleIn(l, 'ocultas'))}>Ocultas</Chip>
          </FilterGroup>
        </FilterBar>
      )}
      {all.length === 0 && <div className="empty">Fichas de combate com valores livres: humanos, demoníacos, etéreos e celestiais. Crie a primeira ameaça.</div>}
      {all.length > 0 && threats.length === 0 && <div className="empty">Nenhuma ameaça com esses filtros.</div>}
      <div className="threat-grid">
        {threats.map((t) => <ThreatCard key={t.id} t={t} inCombat={!!table.combat} onOpen={() => open(t.id)} />)}
      </div>
      {editor}
    </div>
  );
}

/**
 * Cartão de consulta rápida: categoria, nome, os números do molde numa linha e o ataque
 * principal. Atributos, habilidades e anotações ficam na ficha (clicar abre).
 */
function ThreatCard({ t, inCombat, onOpen }: { t: Threat; inCombat: boolean; onOpen: () => void }) {
  const { act } = useAct();
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };
  // Sempre as mesmas cinco colunas, para os cartões alinharem lado a lado.
  const stats: Array<{ label: string; value: string | number; cls?: string; title?: string }> = [
    { label: 'PV', value: t.pvMax, cls: 'pv' },
    { label: 'PE', value: t.peMax > 0 ? t.peMax : '—', cls: t.peMax > 0 ? 'pe' : 'none' },
    { label: 'DEF', value: t.def, title: 'Defesa' },
    { label: 'VON', value: t.von, title: 'Vontade' },
    { label: 'RD', value: t.rdPhysical || t.rdMagic ? `${t.rdPhysical}/${t.rdMagic}` : '—', title: 'RD física / mágica', cls: t.rdPhysical || t.rdMagic ? undefined : 'none' },
  ];
  const main = [...t.attacks].sort((a, b) => b.bonus - a.bonus)[0];
  const extra = t.attacks.length - 1 + t.abilities.length;
  return (
    <div className={`threat-card${t.visible ? '' : ' threat-hidden'}`} role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}>
      <div className="threat-card-head">
        <ThreatIcon category={t.category} />
        <div className="grow">
          <div className="threat-name">{t.name}</div>
          <div className="threat-concept">{t.concept || THREAT_CATEGORIES[t.category]?.label}</div>
        </div>
        <div className="threat-card-actions">
          {inCombat && (
            <button className="btn btn-sm btn-ghost btn-icon" title="Pôr uma cópia desta ameaça no combate"
              onClick={stop(() => void act({ type: 'combat/add', refs: [{ kind: 'threat', id: t.id }] }, `${t.name} entrou no combate.`))}>
              <Swords size={14} />
            </button>
          )}
          <button className={`btn btn-sm btn-ghost btn-icon${t.visible ? ' threat-eye-on' : ''}`}
            title={t.visible ? 'Visível aos jogadores (nome e descrição). Clique para ocultar.' : 'Oculta dos jogadores. Clique para mostrar.'}
            onClick={stop(() => void act({ type: 'threat/visibility', threatId: t.id, visible: !t.visible }))}>
            {t.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      </div>

      <dl className="threat-line">
        {stats.map((s) => (
          <div key={s.label} title={s.title} className={s.cls}>
            <dt>{s.label}</dt><dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      {(main || extra > 0) && (
        <div className="threat-hit">
          {main ? (
            <>
              <Swords size={12} className="muted" />
              <span className="grow">{main.name}</span>
              <span className="mono">{fmtMod(main.bonus)}</span>
              {main.damage && <span className="mono item-dmg">{main.damage}</span>}
            </>
          ) : <span className="grow" />}
          {extra > 0 && <span className="threat-more" title={`${t.attacks.length} ataques · ${t.abilities.length} habilidades`}>+{extra}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Ficha de ameaça. Com `combatantId`, mostra a instância de um combate: PV/PE
 * e rolagens vão para ela, e o molde do livro (editar, duplicar...) fica de fora.
 */
export function ThreatSheet(props: { t: Threat; onDuplicated?: (id: string) => void } | { t: CombatThreat; combatantId: string; templateName?: string }) {
  const { t } = props;
  const combatantId = 'combatantId' in props ? props.combatantId : undefined;
  const book = combatantId ? undefined : (t as Threat);
  const { act } = useAct();
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [adjust, setAdjust] = useState<AdjustStart | null>(null);

  const setRes = async (pv: number, pe: number, reason?: string) => {
    const v = { pv: Math.min(t.pvMax, pv), pe: Math.max(0, Math.min(t.peMax, pe)), reason };
    return (await act(combatantId ? { type: 'combat/resource', combatantId, ...v } : { type: 'threat/resource', threatId: book!.id, ...v })).ok;
  };
  const tracks: AdjustTrack[] = [
    {
      key: 'pv', label: 'PV', icon: <Heart size={16} color="var(--pv)" />, color: 'var(--pv)', barClass: 'bar-pv',
      current: t.current.pv, max: t.pvMax, ops: pvOps(t.rdPhysical, t.rdMagic),
      status: (v) => (v <= 0 && t.current.pv > 0 ? 'A ameaça é abatida (PV ≤ 0).' : undefined),
    },
    {
      key: 'pe', label: 'PE', icon: <Zap size={16} color="var(--pe)" />, color: 'var(--pe)', barClass: 'bar-pe',
      current: t.current.pe, max: t.peMax, min: 0, ops: peOps(),
    },
  ];
  const roll = async (expr: string, label: string, attr?: (typeof ATTR_KEYS)[number]) => {
    const fx = startRollFx({ who: t.name, attr, label, expr });
    const r = await act({ type: 'roll', expr, ...(combatantId ? { combatantId } : { threatId: book!.id }), attr, label, hidden });
    if (!r.ok) cancelRollFx(fx);
  };

  return (
    <div className="sheet">
      <div className="card card-gold">
        <div className="sheet-head">
          <ThreatIcon category={t.category} size={24} box={52} />
          <div className="grow">
            <div className="sheet-title">{combatantId ? 'Ameaça em combate' : 'Ameaça'} · {THREAT_CATEGORIES[t.category]?.label ?? 'Humano'}</div>
            <h2 className="sheet-name">{t.name}</h2>
            {t.concept && <div className="secondary">{t.concept}</div>}
            {'templateName' in props && props.templateName && (
              <div className="tiny muted mt">Molde: {props.templateName}. Os ajustes aqui valem só para este combate.</div>
            )}
          </div>
          {book && (
            <div className="row-wrap">
              <button className={`btn btn-sm${book.visible ? ' btn-primary' : ''}`} title="Mostrar nome e descrição aos jogadores"
                onClick={() => act({ type: 'threat/visibility', threatId: book.id, visible: !book.visible })}>
                {book.visible ? <Eye size={14} /> : <EyeOff size={14} />} {book.visible ? 'Visível' : 'Oculta'}
              </button>
              <button className="btn btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
              <button className="btn btn-sm" onClick={async () => { const r = await act({ type: 'threat/duplicate', threatId: book.id }, 'Ameaça duplicada.'); if (r.ok && r.id && 'onDuplicated' in props) props.onDuplicated?.(r.id); }}><Copy size={14} /> Duplicar</button>
              <ConfirmButton title="Excluir ameaça" modalTitle="Excluir ameaça" confirmLabel={`Excluir ${t.name}`}
                message={<><p>Excluir a ameaça <strong>{t.name}</strong>?</p><p className="small muted mt">Não dá para desfazer.</p></>}
                onConfirm={() => act({ type: 'threat/delete', threatId: book.id }, 'Ameaça excluída.')}><Trash2 size={14} /></ConfirmButton>
            </div>
          )}
        </div>
      </div>

      <div className="stats">
        {/* Molde do livro: só os máximos. PV/PE de verdade ficam nas instâncias de cada combate. */}
        {book && <div className="stat"><span className="stat-val" style={{ color: 'var(--pv)' }}>{t.pvMax}</span><span className="stat-lbl">PV</span></div>}
        {book && <div className="stat"><span className="stat-val" style={{ color: 'var(--pe)' }}>{t.peMax}</span><span className="stat-lbl">PE</span></div>}
        <div className="stat"><span className="stat-val">{t.def}</span><span className="stat-lbl">Defesa</span></div>
        <div className="stat"><span className="stat-val">{t.von}</span><span className="stat-lbl">Vontade</span></div>
        <div className="stat"><span className="stat-val">{t.rdPhysical}</span><span className="stat-lbl">RD física</span></div>
        <div className="stat"><span className="stat-val">{t.rdMagic}</span><span className="stat-lbl">RD mágica</span></div>
      </div>

      {combatantId && <div className="card">
        <div className="row mb">
          <div className="card-title" style={{ margin: 0 }}>Vitalidade</div>
          {t.current.pv <= 0 && <span className="badge badge-err">Abatida</span>}
        </div>
        <div className="grid-2">
          {tracks.map((x) => (
            <div className="vital" key={x.key}>
              <button className="vital-hit" title={`Ajustar ${x.label}`} onClick={() => setAdjust({ track: x.key })}>
                <div className="vital-top">
                  {x.icon}<span className="vital-label" style={{ color: x.color }}>{x.label}</span>
                  <span className="vital-num">{x.current}</span><span className="vital-max">/ {x.max}</span>
                </div>
                <div className={`bar ${x.current < 0 ? 'bar-neg' : x.barClass}`} style={{ marginTop: 6 }}>
                  <div style={{ width: x.current < 0 ? '100%' : pct(x.current, x.max!) }} />
                </div>
              </button>
              <div className="vital-actions">
                {x.key === 'pv' ? (
                  <>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pv', op: 'phys' })}>Dano</button>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pv', op: 'heal' })}>Curar</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pe', op: 'spend' })}>Gastar</button>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pe', op: 'recover' })}>Recuperar</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {adjust && (
          <ResourceAdjustModal title={`Ajustar ${t.name}`} tracks={tracks} start={adjust}
            onApply={(k, v, reason) => (k === 'pv' ? setRes(v, t.current.pe, reason) : setRes(t.current.pv, v, reason))}
            onRestoreAll={{ label: 'Restaurar tudo', run: () => setRes(t.pvMax, t.peMax, 'Restaurada') }}
            onClose={() => setAdjust(null)} />
        )}
      </div>}

      <div className="card">
        <div className="row mb">
          <div className="card-title" style={{ margin: 0 }}>Atributos</div>
          <div className="spacer" />
          <label className="check"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Rolagens ocultas</label>
        </div>
        <div className="attrs">
          {ATTR_KEYS.map((k) => (
            <button key={k} className="attr" title={`Rolar teste de ${ATTRIBUTES[k].name}`} onClick={() => roll('d20', '', k)}>
              <span className="attr-key">{ATTRIBUTES[k].short}</span>
              <span className="attr-val">{fmtMod(t.attributes[k])}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Swords size={14} /> Ataques</div>
        {t.attacks.length === 0 && <div className="empty">Nenhum ataque.</div>}
        {t.attacks.map((a) => {
          const dmgOk = !!a.damage && !!parseExpr(a.damage);
          return (
            <div key={a.id} className="inv-row">
              <div className="grow">
                <div className="row-wrap">
                  <strong>{a.name}</strong>
                  <span className="badge badge-gold">{fmtMod(a.bonus)}</span>
                  {a.damage && <span className="badge badge-err">{a.damage}</span>}
                </div>
                {a.notes && <div className="small muted">{a.notes}</div>}
              </div>
              <button className="btn btn-sm" onClick={() => roll(`d20${a.bonus ? fmtMod(a.bonus) : ''}`, `Ataque: ${a.name}`)}><Dices size={13} /> Atacar</button>
              <button className="btn btn-sm" disabled={!dmgOk} title={dmgOk ? undefined : 'Dano não é uma expressão de dados'} onClick={() => roll(a.damage, `Dano: ${a.name}`)}>Dano</button>
            </div>
          );
        })}
      </div>

      {t.abilities.length > 0 && (
        <div className="card">
          <div className="card-title">Habilidades</div>
          <div className="col">
            {t.abilities.map((h) => (
              <div key={h.id} className="ability" style={{ padding: '10px 12px' }}>
                <div className="row"><span className="ability-name">{h.name}</span>{h.cost && <span className="badge badge-gold">{h.cost}</span>}</div>
                {h.text && <div className="small secondary pre" style={{ marginTop: 4 }}>{h.text}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {t.notes && (
        <div className="card">
          <div className="card-title">Anotações</div>
          <div className="pre small secondary">{t.notes}</div>
        </div>
      )}

      {editing && book && (
        <ThreatEditor title={`Editar ${book.name}`} initial={book} onClose={() => setEditing(false)}
          onSave={async (data) => (await act({ type: 'threat/upsert', threatId: book.id, data }, 'Ameaça salva.')).ok} />
      )}
    </div>
  );
}
