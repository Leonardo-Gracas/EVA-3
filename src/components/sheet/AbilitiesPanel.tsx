import { useMemo, useState } from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import type { Character } from '../../model/types';
import type { Derived } from '../../rules/derive';
import { deriveStats } from '../../rules/derive';
import { BENCAO, bencaoCost, bencaoExtrasFor, type Ability } from '../../rules/abilities';
import { CLASSES, MAX_LEVEL, type ClassId } from '../../rules/classes';
import { abilityOptions, classesAvailable } from '../../rules/validate';
import { useAct } from '../act';
import ActButton from '../common/ActButton';
import Modal from '../common/Modal';
import AbilityCard from './AbilityCard';

export default function AbilitiesPanel({ ch, d, readOnly }: { ch: Character; d: Derived; readOnly?: boolean }) {
  const [using, setUsing] = useState<Ability | null>(null);
  const [leveling, setLeveling] = useState(false);
  const owned = ch.levels.flatMap((l, i) => (l.abilityId ? [{ level: i + 1, classId: l.classId, id: l.abilityId }] : []));
  const hasSobriedade = d.abilities.some((a) => a.id === 'sobriedade');

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}><Sparkles size={14} /> Habilidades</div>
        <div className="spacer" />
        {!readOnly && d.level < MAX_LEVEL && (
          <ActButton perm="level_up" className="btn btn-sm" onClick={() => setLeveling(true)}>
            <TrendingUp size={14} /> Subir de nível
          </ActButton>
        )}
      </div>
      {owned.length === 0 && <div className="empty">Nenhuma habilidade.</div>}
      <div className="col">
        {d.abilities.map((a) => (
          <AbilityCard
            key={a.id}
            ability={a}
            showClass={d.classes.length > 1}
            action={!readOnly && !a.passive ? (
              <ActButton perm="ability_use" className="btn btn-sm" onClick={() => setUsing(a)}>Usar</ActButton>
            ) : undefined}
          />
        ))}
      </div>
      {hasSobriedade && !readOnly && (
        <p className="tiny muted mt">Sobriedade: lembre de descontar 1 PE das conjurações mágicas (mínimo 1).</p>
      )}
      {using && <UseAbilityModal ch={ch} ability={using} onClose={() => setUsing(null)} />}
      {leveling && <LevelUpModal ch={ch} onClose={() => setLeveling(false)} />}
    </div>
  );
}

function UseAbilityModal({ ch, ability, onClose }: { ch: Character; ability: Ability; onClose: () => void }) {
  const { act } = useAct();
  const special = ability.id === 'cssml' ? 'all' : ability.id === 'bravura' ? 'bravura' : null;
  const bencao = ability.id === 'bencao';
  const testBonus = ch.attributes.FE + Math.floor(ch.levels.length / 2);
  const [pe, setPe] = useState(String(special === 'all' ? ch.current.pe : ability.peCost ?? 0));
  const [pv, setPv] = useState(String(ability.pvCost ?? 0));
  const [note, setNote] = useState('');
  const maxExtras = bencaoExtrasFor(ch.current.pe);
  const [extras, setExtras] = useState(String(maxExtras));
  const extrasN = Math.min(maxExtras, parseInt(extras, 10) || 0);
  // Na Benção o PE enviado é o teto: 3 do teste + 2 por d4 extra que o jogador topar.
  const peN = bencao ? bencaoCost(1 + extrasN) : parseInt(pe, 10) || 0;
  const pvN = bencao ? 0 : parseInt(pv, 10) || 0;

  const go = async () => {
    const r = await act({ type: 'ability/use', characterId: ch.id, abilityId: ability.id, pe: peN, pv: special ? 0 : pvN, note: note.trim() || undefined }, `${ability.name} usada.`);
    if (r.ok) onClose();
  };

  return (
    <Modal open title={`Usar ${ability.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={peN > ch.current.pe} onClick={go}>Usar</button></>}>
      <div className="col gap-lg">
        <p className="secondary pre small">{ability.text}</p>
        {bencao ? (
          <div className="col">
            <p className="small gold">
              Gasta {BENCAO.baseCost} PE e rola o teste de FÉ (d20 + {testBonus}) automaticamente: superando {BENCAO.cd}, cura 1d4.
              Se falhar, os {BENCAO.baseCost} PE são gastos mesmo assim. A cada {BENCAO.step} pontos acima de {BENCAO.cd},
              pode curar mais 1d4 por mais {BENCAO.extraCost} PE.
            </p>
            <div className="field">
              <label className="label">Usar até quantos d4 extras, se o teste der — máximo {maxExtras} com {ch.current.pe} PE</label>
              <input className="input" value={extras} disabled={maxExtras === 0}
                onChange={(e) => setExtras(e.target.value.replace(/[^\d]/g, ''))} />
              <span className="tiny muted">Gasta no máximo {peN} PE. Ponha 0 para curar só 1d4.</span>
            </div>
          </div>
        ) : <div className="grid-2">
          <div className="field">
            <label className="label">{special === 'bravura' ? 'PE a converter (×2 PV)' : 'Gastar PE'} — disponível {ch.current.pe}</label>
            <input className="input" value={pe} disabled={special === 'all'} onChange={(e) => setPe(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
          {!special && (
            <div className="field">
              <label className="label">Gastar PV</label>
              <input className="input" value={pv} onChange={(e) => setPv(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
          )}
        </div>}
        {ability.id === 'oracao' && <p className="small gold">Recupera 1d6 + {2 * ch.attributes.FE} (dobro da FÉ) de PE, rolado automaticamente.</p>}
        {peN > ch.current.pe && <p className="small" style={{ color: 'var(--error)' }}>PE insuficiente.</p>}
        <div className="field">
          <label className="label">Nota (alvo, efeito extra…)</label>
          <input className="input" value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export function LevelUpModal({ ch, onClose }: { ch: Character; onClose: () => void }) {
  const { act } = useAct();
  const available = classesAvailable(ch.levels);
  const last = ch.levels[ch.levels.length - 1]?.classId;
  const [classId, setClassId] = useState<ClassId>(last && available.includes(last) ? last : available[0]);
  const options = useMemo(() => abilityOptions(ch.attributes, ch.levels, classId), [ch, classId]);
  const eligible = options.filter((o) => o.eligible);
  const [abilityId, setAbilityId] = useState<string | null>(null);
  const valid = eligible.length === 0 || (abilityId && eligible.some((o) => o.ability.id === abilityId));
  const preview = deriveStats({ ...ch, levels: [...ch.levels, { classId, abilityId: valid ? abilityId : null }] });
  const now = deriveStats(ch);

  const go = async () => {
    const r = await act({ type: 'level/up', characterId: ch.id, classId, abilityId: eligible.length ? abilityId : null }, 'Nível aumentado!');
    if (r.ok) onClose();
  };

  return (
    <Modal open width={640} title={`Nível ${ch.levels.length + 1} — ${ch.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valid} onClick={go}>Confirmar</button></>}>
      <div className="col gap-lg">
        <div>
          <label className="label">Classe que recebe o nível {available.length < 4 && <span className="muted">(máximo de 2 classes)</span>}</label>
          <div className="grid-2">
            {available.map((c) => (
              <button key={c} className={`card card-hover${c === classId ? ' card-selected' : ''}`} style={{ textAlign: 'left', padding: 12 }}
                onClick={() => { setClassId(c); setAbilityId(null); }}>
                <div className="row"><strong style={{ color: CLASSES[c].color }}>{CLASSES[c].name}</strong>
                  <span className="spacer" /><span className="tiny muted">nível {now.classLevels[c]} → {now.classLevels[c] + 1}</span></div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Habilidade</label>
          {eligible.length === 0 && <div className="empty small">Nenhuma habilidade disponível nesta classe agora. O nível sobe sem habilidade.</div>}
          <div className="col">
            {options.map((o) => (
              <AbilityCard key={o.ability.id} ability={o.ability} disabledReason={o.eligible ? undefined : o.reason} defaultOpen={o.eligible}
                selected={abilityId === o.ability.id} onSelect={() => setAbilityId(o.ability.id)} />
            ))}
          </div>
        </div>
        <div className="row-wrap small secondary">
          <span>PV máx. {now.pvMax} → <strong>{preview.pvMax}</strong></span>
          <span>· PE máx. {now.peMax} → <strong>{preview.peMax}</strong></span>
          {preview.clarezaMax !== now.clarezaMax && <span>· Clareza {now.clarezaMax} → <strong>{preview.clarezaMax}</strong></span>}
          <span>· DEF {now.def} → <strong>{preview.def}</strong></span>
          {preview.von !== now.von && <span>· VON {now.von} → <strong>{preview.von}</strong></span>}
          <span>· Título: <strong className="gold">{preview.title}</strong></span>
        </div>
      </div>
    </Modal>
  );
}
