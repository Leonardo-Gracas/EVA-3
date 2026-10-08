// Manual de regras: o que está no código, explicado para quem joga.
// Navegação por sumário fixo (lateral no computador, faixa no celular) que
// acompanha a seção visível; cada seção abre com um resumo de uma linha.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, BookOpen, Calculator, Dices, Heart, Lightbulb, ListChecks, Minus, Package, Plus, RotateCcw,
  Search, Shield, Sparkles, Swords, Users,
} from 'lucide-react';
import {
  ATTR_COST, ATTR_KEYS, ATTR_MAX, ATTR_MIN, ATTRIBUTES, POINT_BUDGET, emptyAttributes, fmtMod, pointsLeft,
  pointsSpent, type AttrKey, type Attributes,
} from '../rules/attributes';
import { CLASS_IDS, CLASSES, MAX_CLASSES, MAX_LEVEL, titleFor, type ClassId } from '../rules/classes';
import { abilitiesOf } from '../rules/abilities';
import { CLAREZA_BASE, deathThreshold } from '../rules/derive';
import { DEFAULT_DURABILITY, DEFAULT_MOVEMENT, ITEM_TYPES, type ItemType } from '../model/types';
import AbilityCard from './sheet/AbilityCard';

const SECTIONS = [
  { id: 'comecando', label: 'Começando', icon: <ListChecks size={14} /> },
  { id: 'atributos', label: 'Atributos', icon: <Sparkles size={14} /> },
  { id: 'pontos', label: 'Compra de pontos', icon: <Calculator size={14} /> },
  { id: 'testes', label: 'Testes e dados', icon: <Dices size={14} /> },
  { id: 'classes', label: 'Classes e níveis', icon: <Users size={14} /> },
  { id: 'vida', label: 'PV, PE e morte', icon: <Heart size={14} /> },
  { id: 'dano', label: 'Dano e RD', icon: <Shield size={14} /> },
  { id: 'investigacao', label: 'Investigação', icon: <Search size={14} /> },
  { id: 'itens', label: 'Itens', icon: <Package size={14} /> },
  { id: 'habilidades', label: 'Habilidades', icon: <Swords size={14} /> },
  { id: 'glossario', label: 'Glossário', icon: <BookOpen size={14} /> },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const COST_ROWS = Object.entries(ATTR_COST).map(([v, c]) => ({ value: +v, cost: c })).sort((a, b) => a.value - b.value);

/** Quanto custa subir um atributo de `v` para `v + 1`. */
const stepCost = (v: number) => ATTR_COST[v + 1] - ATTR_COST[v];

const EXAMPLES: Array<{ name: string; hint: string; attrs: Partial<Attributes> }> = [
  { name: 'Foco total', hint: 'Um atributo no máximo. Bom para Combatente (FOR).', attrs: { FOR: 4, CON: 2, DES: 1 } },
  { name: 'Dois pilares', hint: 'Dois atributos fortes. Bom para Acólito (FÉ e CON).', attrs: { FE: 3, CON: 3, DES: 1, PRE: 1 } },
  { name: 'Equilibrado', hint: 'Nenhuma fraqueza, nenhum destaque.', attrs: { FOR: 2, CON: 2, DES: 2, INT: 2, FE: 1, PRE: 1 } },
  { name: 'Com sacrifício', hint: 'Baixar FOR para −1 paga o ponto que faltava. Bom para Ocultista (INT).', attrs: { INT: 4, DES: 3, FOR: -1 } },
];

const exampleAttrs = (p: Partial<Attributes>): Attributes => ({ ...emptyAttributes(), ...p });

export default function Reference() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SectionId>('comecando');

  // Altura da barra superior fixa, para o sumário e as âncoras não ficarem embaixo dela.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.topbar');
    const el = root.current;
    if (!bar || !el) return;
    const sync = () => el.style.setProperty('--topbar-h', `${bar.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Marca no sumário a seção que está no topo da tela.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let cur: SectionId = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(`regra-${s.id}`);
        if (el && el.getBoundingClientRect().top <= line) cur = s.id;
      }
      // No fim da página, a última seção pode não alcançar a linha.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].id;
      setActive(cur);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // No celular, mantém o item ativo visível na faixa do sumário.
  useEffect(() => {
    root.current?.querySelector(`.ref-toc [data-id="${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  const go = (id: SectionId) => {
    setActive(id);
    document.getElementById(`regra-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ref" ref={root}>
      <nav className="ref-toc" aria-label="Sumário das regras">
        <div className="ref-toc-title">Sumário</div>
        {SECTIONS.map((s) => (
          <button key={s.id} data-id={s.id} className={`ref-toc-item${active === s.id ? ' on' : ''}`}
            onClick={() => go(s.id)} aria-current={active === s.id ? 'true' : undefined}>
            {s.icon}<span>{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="ref-body">
        <Comecando go={go} />
        <AtributosSec />
        <PontosSec />
        <TestesSec />
        <ClassesSec go={go} />
        <VidaSec />
        <DanoSec />
        <InvestigacaoSec go={go} />
        <ItensSec />
        <HabilidadesSec />
        <GlossarioSec />
      </div>
    </div>
  );
}

// ── Blocos de apoio ──────────────────────────────────────────────────────────

function Section({ id, title, lead, children }: { id: SectionId; title: string; lead: ReactNode; children: ReactNode }) {
  const icon = SECTIONS.find((s) => s.id === id)?.icon;
  return (
    <section id={`regra-${id}`} className="card ref-sec" aria-labelledby={`regra-${id}-h`}>
      <h2 id={`regra-${id}-h`} className="ref-h">{icon}{title}</h2>
      <p className="ref-lead">{lead}</p>
      {children}
    </section>
  );
}

function Callout({ kind, title, children }: { kind: 'tip' | 'warn' | 'example'; title?: string; children: ReactNode }) {
  const icon = kind === 'warn' ? <AlertTriangle size={15} /> : kind === 'tip' ? <Lightbulb size={15} /> : <Dices size={15} />;
  const label = title ?? (kind === 'warn' ? 'Atenção' : kind === 'tip' ? 'Dica' : 'Exemplo');
  return (
    <div className={`ref-callout ref-callout-${kind}`}>
      <div className="ref-callout-title">{icon}{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="ref-sub">{children}</h3>;
}

function Link({ to, go, children }: { to: SectionId; go: (id: SectionId) => void; children: ReactNode }) {
  return <button className="ref-link" onClick={() => go(to)}>{children}</button>;
}

const A = (k: AttrKey) => <strong className="gold">{ATTRIBUTES[k].short}</strong>;

// ── Seções ───────────────────────────────────────────────────────────────────

function Comecando({ go }: { go: (id: SectionId) => void }) {
  return (
    <Section id="comecando" title="Começando" lead="O essencial em um minuto. Cada item leva à explicação completa.">
      <div className="ref-quick">
        <div><strong>Testes:</strong> role 1d20 + atributo. Precisa <em>superar</em> o alvo; empate é falha. <Link to="testes" go={go}>Ver testes</Link></div>
        <div><strong>Atributos:</strong> seis, de −1 a +4, comprados com {POINT_BUDGET} pontos. <Link to="pontos" go={go}>Ver compra</Link></div>
        <div><strong>Níveis:</strong> 1 a {MAX_LEVEL}. Cada nível dá +1 em uma classe e uma habilidade. Até {MAX_CLASSES} classes. <Link to="classes" go={go}>Ver classes</Link></div>
        <div><strong>Defesas:</strong> DEF = 10 + DES contra ataques; VON = 10 + FÉ contra efeitos sobrenaturais. <Link to="testes" go={go}>Ver defesas</Link></div>
        <div><strong>PV em 0:</strong> inconsciente. Morre em −10 ou menos (ou −metade do PV máximo). <Link to="vida" go={go}>Ver PV e PE</Link></div>
        <div><strong>PE em 0:</strong> sem conjurar e sem habilidades ativas. <Link to="vida" go={go}>Ver PV e PE</Link></div>
        <div><strong>Clareza:</strong> {CLAREZA_BASE} + INT. Paga apurações e inquéritos; volta no descanso. <Link to="investigacao" go={go}>Ver investigação</Link></div>
      </div>

      <Sub>Criando um personagem</Sub>
      <ol className="ref-steps">
        <li><strong>Conceito.</strong> Nome e uma linha que resume quem ele é.</li>
        <li><strong>Atributos.</strong> Distribua os {POINT_BUDGET} pontos. <Link to="pontos" go={go}>Como funciona</Link></li>
        <li><strong>Classe.</strong> A classe do nível 1 define seus PV e PE iniciais. <Link to="classes" go={go}>Comparar classes</Link></li>
        <li><strong>Habilidade.</strong> Escolha uma habilidade de 1º nível da classe. <Link to="habilidades" go={go}>Ver lista</Link></li>
        <li><strong>Níveis seguintes.</strong> Se o mestre definir um nível inicial acima do 1, escolha a classe e a habilidade de cada nível, em ordem, como numa subida de nível.</li>
        <li><strong>Revisão.</strong> Envie a ficha. O mestre aprova ou devolve com um comentário.</li>
      </ol>

      <Sub>Como a mesa funciona</Sub>
      <p className="small secondary">
        Toda ação que muda a ficha (gastar PE, equipar um item, subir de nível…) segue a permissão definida pelo mestre:
      </p>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <tbody>
            <tr><td><span className="badge badge-ok">Livre</span></td><td>Acontece na hora.</td></tr>
            <tr><td><span className="badge badge-warn">Solicitar</span></td><td>Vira um pedido. Só é aplicado quando o mestre aprovar.</td></tr>
            <tr><td><span className="badge">Bloqueada</span></td><td>Você não pode fazer; peça ao mestre.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="small secondary mt">As rolagens são feitas pelo navegador do mestre, então ninguém consegue forjar resultado.</p>
    </Section>
  );
}

const ATTR_USES: Record<AttrKey, ReactNode> = {
  FOR: 'Testes de força bruta.',
  CON: <>PV ganho a cada nível (soma CON).</>,
  DES: <>Sua DEF (10 + DES).</>,
  FE: <>Sua VON (10 + FÉ) e o PE por nível do Acólito.</>,
  INT: <>Sua Clareza ({CLAREZA_BASE} + INT) e o PE por nível do Ocultista.</>,
  PRE: <>O PE por nível do Vidente (e a Clareza, com Lampejos).</>,
};

function AtributosSec() {
  return (
    <Section id="atributos" title="Atributos" lead="Seis números que dizem no que o personagem é bom. Você soma o atributo em todo teste ligado a ele.">
      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead><tr><th>Atributo</th><th>Para que serve</th><th>Também calcula</th></tr></thead>
          <tbody>
            {ATTR_KEYS.map((k) => (
              <tr key={k}>
                <td className="nowrap">{A(k)} {ATTRIBUTES[k].name}</td>
                <td>{ATTRIBUTES[k].description}</td>
                <td className="secondary">{ATTR_USES[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout kind="tip">
        Os valores vão de <strong>{fmtMod(ATTR_MIN)}</strong> (fraco) a <strong>{fmtMod(ATTR_MAX)}</strong> (excepcional).
        +0 é a média de uma pessoa comum.
      </Callout>
    </Section>
  );
}

function PontosSec() {
  return (
    <Section id="pontos" title={`Compra de ${POINT_BUDGET} pontos`}
      lead={<>Todos os atributos começam em <strong>+0</strong>. Você tem <strong>{POINT_BUDGET} pontos</strong> para subir os que quiser — e valores altos custam mais caro.</>}>
      <Sub>As regras</Sub>
      <ul className="ref-list">
        <li>Cada atributo fica entre <strong>{fmtMod(ATTR_MIN)}</strong> e <strong>{fmtMod(ATTR_MAX)}</strong>.</li>
        <li>Até +2, cada +1 custa <strong>1 ponto</strong>. Depois fica caro: +3 custa mais 2, +4 custa mais 3.</li>
        <li>Baixar um atributo para <strong>−1 devolve 1 ponto</strong> para gastar em outro.</li>
        <li>Não é obrigatório gastar tudo, mas pontos que sobram não ficam guardados.</li>
      </ul>

      <Sub>Tabela de custos</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table ref-cost">
          <thead>
            <tr><th>Valor final</th><th>Custo total</th><th>Para chegar do valor anterior</th><th aria-hidden="true" className="hide-sm" /></tr>
          </thead>
          <tbody>
            {COST_ROWS.map(({ value, cost }) => (
              <tr key={value} className={value === 0 ? 'ref-row-base' : undefined}>
                <td><strong className="ref-num">{fmtMod(value)}</strong></td>
                <td>
                  {cost < 0 ? <span className="ref-gain">devolve {-cost}</span> : cost === 0 ? <span className="muted">grátis (inicial)</span> : <><strong>{cost}</strong> {cost === 1 ? 'ponto' : 'pontos'}</>}
                </td>
                <td className="secondary">{value <= 0 ? '—' : `+${stepCost(value - 1)}`}</td>
                <td className="hide-sm" aria-hidden="true">
                  <span className="ref-pips">{Array.from({ length: Math.max(0, cost) }, (_, i) => <i key={i} />)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout kind="tip">
        Levar um atributo de +3 para +4 custa <strong>3 pontos</strong> — o mesmo que subir três atributos de +0 para +1.
        Vale a pena só se esse atributo for o coração do personagem.
      </Callout>

      <Sub>Distribuições prontas (todas somam {POINT_BUDGET})</Sub>
      <div className="ref-examples">
        {EXAMPLES.map((ex) => {
          const attrs = exampleAttrs(ex.attrs);
          const used = ATTR_KEYS.filter((k) => attrs[k] !== 0);
          return (
            <div key={ex.name} className="ref-example">
              <div className="row"><strong>{ex.name}</strong><span className="spacer" /><span className="badge badge-gold">{pointsSpent(attrs)} pontos</span></div>
              <div className="ref-attr-chips">
                {ATTR_KEYS.map((k) => (
                  <span key={k} className={`ref-chip${attrs[k] === 0 ? ' zero' : attrs[k] < 0 ? ' neg' : ''}`}>
                    <span className="k">{ATTRIBUTES[k].short}</span>{fmtMod(attrs[k])}
                  </span>
                ))}
              </div>
              <div className="tiny muted mono">
                {used.map((k, i) => {
                  const c = ATTR_COST[attrs[k]];
                  return <span key={k}>{i === 0 ? (c < 0 ? '−' : '') : c < 0 ? ' − ' : ' + '}{Math.abs(c)}</span>;
                })} = {pointsSpent(attrs)}
              </div>
              <div className="small secondary">{ex.hint}</div>
            </div>
          );
        })}
      </div>

      <Sub>Experimente</Sub>
      <PointBuySim />
      <Callout kind="warn">Os atributos não mudam depois que o mestre aprova a ficha. Distribua com calma.</Callout>
    </Section>
  );
}

function PointBuySim() {
  const [attrs, setAttrs] = useState<Attributes>(emptyAttributes);
  const left = pointsLeft(attrs);
  const set = (k: AttrKey, v: number) => setAttrs({ ...attrs, [k]: v });
  return (
    <div className="ref-sim">
      <div className="row">
        <div>
          <div className={`points-left${left < 0 ? ' neg' : ''}`}>{left}</div>
          <div className="tiny muted">de {POINT_BUDGET} pontos restantes</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={() => setAttrs(emptyAttributes())} disabled={ATTR_KEYS.every((k) => attrs[k] === 0)}>
          <RotateCcw size={13} /> Zerar
        </button>
      </div>
      <div className="ref-sim-grid">
        {ATTR_KEYS.map((k) => {
          const v = attrs[k];
          const next = v < ATTR_MAX ? stepCost(v) : null;
          const canUp = next !== null && left - next >= 0;
          return (
            <div key={k} className="ref-sim-attr">
              <div className="attr-key">{ATTRIBUTES[k].short}</div>
              <div className="stepper">
                <button className="btn btn-sm btn-icon" disabled={v <= ATTR_MIN} onClick={() => set(k, v - 1)} aria-label={`Diminuir ${ATTRIBUTES[k].name}`}><Minus size={14} /></button>
                <span className="val">{fmtMod(v)}</span>
                <button className="btn btn-sm btn-icon" disabled={!canUp} onClick={() => set(k, v + 1)} aria-label={`Aumentar ${ATTRIBUTES[k].name}`}><Plus size={14} /></button>
              </div>
              <div className="tiny muted">
                {next === null ? 'no máximo' : `próximo: ${next} pt${next > 1 ? 's' : ''}`}
              </div>
            </div>
          );
        })}
      </div>
      <p className="tiny muted">Simulação apenas para consulta: não altera nenhuma ficha.</p>
    </div>
  );
}

function TestesSec() {
  const bonusRows = Array.from({ length: MAX_LEVEL / 2 + 1 }, (_, b) => b);
  return (
    <Section id="testes" title="Testes e dados" lead="Quando o resultado de uma ação é incerto, role 1d20, some os bônus e compare com o alvo.">
      <div className="ref-formula" aria-label="Fórmula do teste">
        <span className="term">1d20</span><span className="op">+</span>
        <span className="term">atributo</span><span className="op">+</span>
        <span className="term">bônus de nível</span><span className="op">&gt;</span>
        <span className="term gold">alvo</span>
      </div>
      <ul className="ref-list">
        <li>Você precisa <strong>superar</strong> o alvo: tirar exatamente o valor do alvo é falha.</li>
        <li>O <strong>bônus de nível</strong> é +1 a cada nível par e vale para todos os atributos. O valor do atributo em si não muda.</li>
        <li>Na ficha, toque em um atributo para rolar o teste com tudo já somado.</li>
      </ul>

      <Sub>Bônus de nível</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table ref-compact">
          <tbody>
            <tr><th>Nível</th>{bonusRows.map((b) => <td key={b}>{b === 0 ? '1' : b * 2 + 1 <= MAX_LEVEL ? `${b * 2}–${b * 2 + 1}` : `${b * 2}`}</td>)}</tr>
            <tr><th>Bônus</th>{bonusRows.map((b) => <td key={b}><strong>{fmtMod(b)}</strong></td>)}</tr>
          </tbody>
        </table>
      </div>

      <Sub>Alvos de defesa</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead><tr><th>Defesa</th><th>Cálculo</th><th>Quando é usada</th></tr></thead>
          <tbody>
            <tr><td><strong>DEF</strong> (Defesa)</td><td className="nowrap">10 + {A('DES')}</td><td>Alvo de quem tenta te acertar com um ataque.</td></tr>
            <tr><td><strong>VON</strong> (Vontade)</td><td className="nowrap">10 + {A('FE')}</td><td>Alvo de efeitos sobrenaturais contra você, como maldições e tentações.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="small secondary mt">Habilidades e itens equipados podem somar à DEF; a ficha mostra a conta completa.</p>

      <Callout kind="example">
        Você tem DES +2 e está no nível 4 (bônus +2). Um inimigo tem DEF 14.
        Você rola 11: <strong>11 + 2 + 2 = 15</strong>, que supera 14 — <strong className="crit">acerto</strong>.
        Se tivesse rolado 10, o total seria 14 e empataria: <strong className="fumble">falha</strong>.
      </Callout>

      <Sub>Críticos</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <tbody>
            <tr><td className="nowrap"><strong className="crit">20 no dado</strong></td><td>Crítico. Algumas habilidades aumentam a margem: “Crítico 18” significa crítico com 18, 19 ou 20.</td></tr>
            <tr><td className="nowrap"><strong className="fumble">1 no dado</strong></td><td>Falha crítica.</td></tr>
          </tbody>
        </table>
      </div>

      <Sub>Como escrever uma rolagem</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead><tr><th>Escreva</th><th>Significa</th></tr></thead>
          <tbody>
            <tr><td><code>d20</code></td><td>Um dado de 20 faces.</td></tr>
            <tr><td><code>2d6</code></td><td>Dois dados de 6 faces, somados.</td></tr>
            <tr><td><code>1d8+3</code></td><td>Um d8 mais 3.</td></tr>
            <tr><td><code>2d6+1d4-1</code></td><td>Dá para misturar dados e números.</td></tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ClassesSec({ go }: { go: (id: SectionId) => void }) {
  const cb = CLASSES.combatente;
  const exCon = 2;
  return (
    <Section id="classes" title="Classes e níveis" lead={`Cada nível, de 1 a ${MAX_LEVEL}, vai para uma classe e traz uma habilidade dela. Um personagem pode ter no máximo ${MAX_CLASSES} classes.`}>
      <ul className="ref-list">
        <li>Ao subir de nível, escolha a classe que recebe o nível e uma habilidade dessa classe.</li>
        <li>Algumas habilidades exigem um nível mínimo <em>na classe</em> (não no personagem) ou um atributo mínimo.</li>
        <li>Depois de ter {MAX_CLASSES} classes, os próximos níveis só podem ir para elas.</li>
      </ul>

      <Sub>Comparando as classes</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead>
            <tr><th>Classe</th><th>PV no nível 1</th><th>PV por nível</th><th>PE no nível 1</th><th>PE por nível</th></tr>
          </thead>
          <tbody>
            {CLASS_IDS.map((c) => {
              const i = CLASSES[c];
              return (
                <tr key={c}>
                  <td><strong style={{ color: i.color }}>{i.name}</strong><div className="tiny muted">{i.tagline}</div></td>
                  <td className="nowrap">{i.pvInitial} + CON</td>
                  <td className="nowrap">{i.pvPerLevel} + CON</td>
                  <td>{i.peInitial}</td>
                  <td className="nowrap">{i.pePerLevel}{i.peAttr ? ` + ${ATTRIBUTES[i.peAttr].short}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small secondary mt">
        Os valores “no nível 1” valem só para a classe do primeiro nível do personagem. Cada nível seguinte usa os valores “por nível” da classe que recebeu aquele nível.
        Um nível sempre dá pelo menos 1 PV.
      </p>
      <Callout kind="example">
        Um {cb.name} com CON +{exCon} começa com {cb.pvInitial} + {exCon} = <strong>{cb.pvInitial + exCon} PV</strong> e {cb.peInitial} PE.
        No nível 2, se continuar {cb.name}, ganha {cb.pvPerLevel} + {exCon} = <strong>+{cb.pvPerLevel + exCon} PV</strong> e <strong>+{cb.pePerLevel} PE</strong>.
      </Callout>

      <Sub>Títulos</Sub>
      <p className="small secondary">A partir do nível 2, o personagem ganha um título pela combinação das suas classes. Ficar em uma classe só também dá título.</p>
      <div className="ref-table-wrap">
        <table className="ref-table ref-matrix">
          <thead>
            <tr><th />{CLASS_IDS.map((c) => <th key={c} style={{ color: CLASSES[c].color }}>{CLASSES[c].name}</th>)}</tr>
          </thead>
          <tbody>
            {CLASS_IDS.map((a) => (
              <tr key={a}>
                <th style={{ color: CLASSES[a].color }}>{CLASSES[a].name}</th>
                {CLASS_IDS.map((b) => <td key={b}>{titleFor(a, b)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small secondary mt">Para ver as habilidades de cada classe, vá até <Link to="habilidades" go={go}>Habilidades</Link>.</p>
    </Section>
  );
}

function VidaSec() {
  const samples = [14, 20, 30, 41];
  return (
    <Section id="vida" title="PV, PE e morte" lead="PV é o quanto você aguenta apanhar. PE é a energia para usar habilidades e magia.">
      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead><tr><th>Situação</th><th>O que acontece</th></tr></thead>
          <tbody>
            <tr><td><strong className="pv">PV em 0 ou menos</strong></td><td>Inconsciente. (Quem tem <em>Inabalável</em> continua de pé.)</td></tr>
            <tr><td><strong className="pv">PV no limite de morte</strong></td><td>Morte. O limite é −10 ou −metade do PV máximo, o que for mais negativo.</td></tr>
            <tr><td><strong className="pe">PE em 0</strong></td><td>Não pode conjurar nem usar habilidades. Passivas continuam valendo.</td></tr>
            <tr><td><strong className="clareza">Clareza em 0</strong></td><td>Não pode apurar hipóteses nem abrir inquéritos até descansar.</td></tr>
          </tbody>
        </table>
      </div>

      <Sub>Descanso</Sub>
      <p className="small secondary">
        Quando o mestre concede um descanso, os personagens escolhidos por ele recuperam <strong className="pv">PV</strong>,{' '}
        <strong className="pe">PE</strong> e <strong className="clareza">Clareza</strong> até o máximo. Personagens mortos não descansam.
      </p>

      <Sub>Limite de morte</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table ref-compact">
          <tbody>
            <tr><th>PV máximo</th>{samples.map((p) => <td key={p}>{p}</td>)}</tr>
            <tr><th>Morre com</th>{samples.map((p) => <td key={p}><strong className="pv">{deathThreshold(p)}</strong></td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="small secondary mt">Com até 21 PV máximos o limite é sempre −10. Acima disso, é a metade do máximo (arredondada para baixo) em negativo.</p>

      <Callout kind="warn" title="Perdas permanentes">
        Alguns efeitos (como pactos) reduzem o PV ou PE <em>máximo</em> de forma permanente. Só o mestre registra essas perdas.
      </Callout>
    </Section>
  );
}

function DanoSec() {
  return (
    <Section id="dano" title="Dano e RD" lead="A Redução de Dano (RD) é descontada de cada golpe recebido. Existem duas: física e mágica.">
      <div className="ref-formula" aria-label="Fórmula do dano">
        <span className="term">dano recebido</span><span className="op">−</span><span className="term">RD do mesmo tipo</span><span className="op">=</span><span className="term pv">PV perdidos</span>
      </div>
      <ul className="ref-list">
        <li><strong>RD física</strong> reduz golpes, quedas, flechas. <strong>RD mágica</strong> reduz dano sobrenatural.</li>
        <li>A RD nunca cura: se for maior que o dano, você perde 0 PV.</li>
        <li><strong>Dano direto</strong> ignora a RD.</li>
        <li>RD vem de habilidades, de itens equipados e de ajustes do mestre (bênçãos, maldições). A ficha mostra a origem de cada ponto.</li>
      </ul>
      <Callout kind="example">
        Um golpe de 8 de dano físico atinge alguém com RD física 3: perde <strong>5 PV</strong>. Se o mesmo 8 fosse dano mágico e a RD mágica fosse 0, perderia os 8.
      </Callout>
    </Section>
  );
}

function InvestigacaoSec({ go }: { go: (id: SectionId) => void }) {
  return (
    <Section id="investigacao" title="Investigação" lead="Mistérios se resolvem com Clareza: a capacidade do personagem de enxergar o que está diante dele. Ela paga apurações e inquéritos.">
      <div className="ref-formula" aria-label="Fórmula da Clareza">
        <span className="term">{CLAREZA_BASE}</span><span className="op">+</span><span className="term">INT</span><span className="op">=</span><span className="term clareza">Clareza total</span>
      </div>
      <ul className="ref-list">
        <li>A habilidade <strong>Lampejos</strong> (Vidente) soma sua {A('PRE')} à Clareza total.</li>
        <li>A Clareza só volta no <Link to="vida" go={go}>descanso</Link>. Gaste com cuidado.</li>
        <li>O gasto é registrado na ficha (Clareza → Gastar), por você ou pelo mestre.</li>
      </ul>

      <Sub>Evidências e fatos</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <tbody>
            <tr><td className="nowrap"><strong>Evidência</strong></td><td>Objeto ou registro da cena: a faca, um bilhete, pegadas na lama. Precisa ser estudada para dizer alguma coisa.</td></tr>
            <tr><td className="nowrap"><strong>Fato</strong></td><td>O que as evidências provam. Só se chega a um fato por apuração.</td></tr>
          </tbody>
        </table>
      </div>

      <Sub>Apuração</Sub>
      <ol className="ref-steps">
        <li><strong>Hipótese.</strong> Escolha uma ou mais evidências e diga o que você acha que elas mostram.</li>
        <li><strong>Custo.</strong> O mestre cobra em Clareza. Quanto mais difícil de provar, mais caro.</li>
        <li><strong>Pagar ou não.</strong> Se pagar, o mestre revela o fato e o registra no mural. Se desistir, nada é gasto.</li>
      </ol>
      <Callout kind="example">
        Sobre a evidência <em>Faca ensanguentada</em>, você levanta a hipótese: “a faca veio da cozinha da mansão”.
        O mestre cobra 2 de Clareza. Você paga e recebe o fato, que vai para o mural ligado à faca.
      </Callout>

      <Sub>Inquérito</Sub>
      <p className="small secondary">
        Faltou evidência para fechar o caso, ou você quer uma em particular? Abra um inquérito: descreva o <strong>motor da busca</strong>,
        ou seja, onde e como você procura. O mestre cobra em Clareza conforme a dificuldade. Se pagar, o resultado entra no mural como evidência.
      </p>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead><tr><th>Busca</th><th>Custo</th></tr></thead>
          <tbody>
            <tr><td>Encontrar os dados de uma pessoa pelo CPF</td><td>Baixo</td></tr>
            <tr><td>Achar um livro específico numa biblioteca bagunçada</td><td>Alto</td></tr>
          </tbody>
        </table>
      </div>

      <Sub>O mural</Sub>
      <p className="small secondary">
        Cada caso tem um mural na aba <strong>Investigação</strong>, mantido pelo mestre: as evidências, os fatos e os fios que ligam o que se relaciona.
        Toque num cartão para ler o texto completo e ver o que está ligado a ele. O mestre prepara as mudanças à parte e publica de uma vez;
        cada publicação aparece no registro.
      </p>
      <Callout kind="tip">Antes de pagar, olhe o mural: às vezes duas evidências juntas provam mais barato do que uma sozinha.</Callout>
    </Section>
  );
}

function ItensSec() {
  const types = Object.keys(DEFAULT_DURABILITY) as ItemType[];
  return (
    <Section id="itens" title="Itens" lead="Itens só dão bônus enquanto estão equipados e inteiros. Eles também podem ser atacados e quebrar.">
      <ul className="ref-list">
        <li><strong>Equipar</strong> aplica os bônus do item (DEF, RD física, RD mágica) na sua ficha.</li>
        <li>Cada item tem <strong>durabilidade</strong>: PV, RD e DEF do próprio objeto, usados quando ele é o alvo.</li>
        <li>Item com <strong>0 PV está quebrado</strong> e para de dar bônus até ser reparado.</li>
        <li><strong>Catalisadores</strong> (sagrado, profano, etéreo) são exigidos por algumas habilidades. A descrição da habilidade diz qual.</li>
        <li><strong>Ouro</strong> fica à parte do inventário. O <strong>deslocamento</strong> padrão é {DEFAULT_MOVEMENT} m.</li>
      </ul>
      <Sub>Durabilidade padrão por tipo</Sub>
      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead><tr><th>Tipo</th><th>PV</th><th>RD</th><th>DEF</th></tr></thead>
          <tbody>
            {types.map((t) => {
              const d = DEFAULT_DURABILITY[t];
              return <tr key={t}><td>{ITEM_TYPES[t]}</td><td>{d.pv}</td><td>{d.rd}</td><td>{d.def}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="small secondary mt">São valores sugeridos ao criar o item; o mestre pode mudar cada um.</p>
    </Section>
  );
}

function HabilidadesSec() {
  const [cls, setCls] = useState<ClassId>(CLASS_IDS[0]);
  const info = CLASSES[cls];
  return (
    <Section id="habilidades" title="Habilidades" lead="Escolha uma classe para ver todas as habilidades dela. Toque em uma habilidade para ler o texto completo.">
      <div className="ref-legend small secondary">
        <span><span className="badge">Passiva</span> sempre ativa, já somada na ficha</span>
        <span><span className="badge badge-gold">2 PE</span> ativa, mostra o custo de uso</span>
        <span><span className="badge">3º nível</span> nível mínimo na classe</span>
      </div>
      <div className="seg ref-class-seg" role="tablist" aria-label="Classe">
        {CLASS_IDS.map((c) => (
          <button key={c} role="tab" aria-selected={c === cls} className={c === cls ? 'on-inherit' : ''} onClick={() => setCls(c)}
            style={c === cls ? { color: CLASSES[c].color } : undefined}>
            {CLASSES[c].name}
          </button>
        ))}
      </div>
      <div className="ref-class-head">
        <h3 style={{ color: info.color }}>{info.name}</h3>
        <p className="small gold" style={{ fontStyle: 'italic' }}>{info.tagline}</p>
        <p className="small secondary">{info.description}</p>
      </div>
      <div className="col">
        {abilitiesOf(cls).map((a) => <AbilityCard key={a.id} ability={a} />)}
      </div>
    </Section>
  );
}

const GLOSSARY: Array<[string, ReactNode]> = [
  ['PV', 'Pontos de Vida. Chegou a 0, você cai.'],
  ['PE', 'Pontos de Energia. Pagam habilidades ativas e magia.'],
  ['Clareza', `Recurso de investigação: ${CLAREZA_BASE} + INT. Paga apurações e inquéritos; volta no descanso.`],
  ['Descanso', 'Concedido pelo mestre: recupera PV, PE e Clareza até o máximo.'],
  ['Evidência', 'Objeto ou registro de uma cena, estudado para extrair fatos.'],
  ['Fato', 'Conclusão provada por uma apuração.'],
  ['Hipótese', 'O que você acha que uma ou mais evidências mostram.'],
  ['Apuração', 'Pagar Clareza para provar uma hipótese e receber o fato.'],
  ['Inquérito', 'Pagar Clareza para buscar uma evidência nova.'],
  ['DEF', 'Defesa: 10 + DES. Alvo dos ataques contra você.'],
  ['VON', 'Vontade: 10 + FÉ. Alvo de efeitos sobrenaturais contra você.'],
  ['RD', 'Redução de Dano. Física ou mágica; descontada de cada golpe.'],
  ['Teste', '1d20 + atributo + bônus de nível, que precisa superar um alvo.'],
  ['Bônus de nível', '+1 em todos os testes a cada nível par.'],
  ['Crítico', '20 natural no d20 (ou a margem indicada pela habilidade).'],
  ['Nível de classe', 'Quantos níveis você tem naquela classe. Diferente do nível do personagem.'],
  ['Título', 'Nome dado pela combinação das suas classes (ex.: Paladino).'],
  ['Passiva / Ativa', 'Passiva vale sempre; ativa precisa ser usada e costuma custar PE.'],
  ['Catalisador', 'Objeto sagrado, profano ou etéreo exigido por certas habilidades.'],
  ['Durabilidade', 'PV, RD e DEF de um objeto. Com 0 PV, ele quebra.'],
  ['Ação de movimentação', 'Ação curta do turno, usada por algumas habilidades (ex.: Oração).'],
];

function GlossarioSec() {
  return (
    <Section id="glossario" title="Glossário" lead="Siglas e termos usados na ficha e nas habilidades.">
      <dl className="ref-gloss">
        {GLOSSARY.map(([t, d]) => (
          <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
        ))}
      </dl>
    </Section>
  );
}
