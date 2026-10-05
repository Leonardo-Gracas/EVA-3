import { useState } from 'react';
import { ATTR_COST, ATTR_KEYS, ATTRIBUTES, fmtMod } from '../rules/attributes';
import { CLASS_IDS, CLASSES, allTitles, type ClassId } from '../rules/classes';
import { abilitiesOf } from '../rules/abilities';
import AbilityCard from './sheet/AbilityCard';

// Consulta rápida das regras estáticas (o que está no código).
export default function Reference() {
  const [cls, setCls] = useState<ClassId>('combatente');
  const info = CLASSES[cls];
  return (
    <div className="col gap-lg">
      <div className="grid-2">
        <div className="card">
          <div className="card-title">Atributos</div>
          <div className="col">
            {ATTR_KEYS.map((k) => (
              <div key={k}><strong className="gold">{ATTRIBUTES[k].short}</strong> {ATTRIBUTES[k].name} — <span className="secondary small">{ATTRIBUTES[k].description}</span></div>
            ))}
          </div>
          <p className="small secondary mt">Compra de 10 pontos: {Object.entries(ATTR_COST).sort((a, b) => +a[0] - +b[0]).map(([v, c]) => `${fmtMod(+v)} custa ${c}`).join(', ')}.</p>
        </div>
        <div className="card">
          <div className="card-title">Regras gerais</div>
          <ul className="small secondary" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Nível 1 a 12. Cada nível dá +1 em uma classe e 1 habilidade. Máximo de 2 classes.</li>
            <li>Nível par: +1 nos testes de todos os atributos (o atributo base não muda).</li>
            <li>DEF = 10 + DES. VON = 10 + FÉ. É preciso superar o valor para acertar.</li>
            <li>PV zerado: inconsciente. Morre em −10 ou na metade negativa do PV máximo, o que for mais negativo.</li>
            <li>PE zerado: não pode conjurar nem usar habilidades.</li>
          </ul>
          <div className="row-wrap mt">
            {allTitles().map((t) => <span key={t.title} className="badge" title={`${CLASSES[t.a].name} + ${CLASSES[t.b].name}`}>{t.title}</span>)}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="row-wrap mb">
          {CLASS_IDS.map((c) => (
            <button key={c} className={`btn btn-sm${c === cls ? ' btn-primary' : ''}`} onClick={() => setCls(c)}>{CLASSES[c].name}</button>
          ))}
        </div>
        <h3 style={{ color: info.color }}>{info.name}</h3>
        <p className="small secondary">{info.description}</p>
        <p className="small gold mb" style={{ fontStyle: 'italic' }}>{info.tagline}</p>
        <p className="small mb">PV: {info.pvInitial} + CON inicial, {info.pvPerLevel} + CON por nível · PE: {info.peInitial} inicial, {info.pePerLevel}{info.peAttr ? ` + ${ATTRIBUTES[info.peAttr].short}` : ''} por nível</p>
        <div className="col">
          {abilitiesOf(cls).map((a) => <AbilityCard key={a.id} ability={a} />)}
        </div>
      </div>
    </div>
  );
}
