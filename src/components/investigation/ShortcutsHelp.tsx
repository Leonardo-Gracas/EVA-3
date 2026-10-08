import { Fragment } from 'react';
import Modal from '../common/Modal';

const GROUPS: Array<{ title: string; rows: Array<[string[], string]> }> = [
  {
    title: 'Criar e editar',
    rows: [
      [['E'], 'Nova evidência (no cursor)'],
      [['F'], 'Novo fato (no cursor)'],
      [['Enter'], 'Editar o cartão selecionado'],
      [['Ctrl', 'Enter'], 'Salvar a edição'],
      [['Esc'], 'Cancelar a edição'],
    ],
  },
  {
    title: 'Seleção',
    rows: [
      [['Shift', 'clique'], 'Somar ou tirar da seleção'],
      [['Shift', 'arrastar'], 'Laço no fundo do quadro'],
      [['Ctrl', 'A'], 'Selecionar tudo'],
      [['Esc'], 'Limpar a seleção'],
      [['Tab'], 'Próximo cartão'],
    ],
  },
  {
    title: 'Organizar',
    rows: [
      [['← ↑ → ↓'], 'Mover 10 px (com Shift: 50 px)'],
      [['L'], 'Ligar o primeiro selecionado aos demais'],
      [['H'], 'Ocultar ou revelar aos jogadores'],
      [['Ctrl', 'D'], 'Duplicar'],
      [['Del'], 'Excluir'],
      [['Ctrl', 'Z'], 'Desfazer'],
      [['Ctrl', 'Shift', 'Z'], 'Refazer (também Ctrl+Y)'],
    ],
  },
  {
    title: 'Publicar',
    rows: [
      [['Ctrl', 'S'], 'Enviar o mural aos jogadores'],
    ],
  },
  {
    title: 'Visão',
    rows: [
      [['+'], 'Aproximar'],
      [['−'], 'Afastar'],
      [['0'], 'Zoom 100%'],
      [['1'], 'Enquadrar tudo'],
      [['Ctrl', 'roda'], 'Zoom no cursor'],
      [['?'], 'Esta lista'],
    ],
  },
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal open width={640} title="Atalhos do mural" onClose={onClose}>
      <p className="small muted mb">
        Arraste Evidência ou Fato da paleta para o quadro e digite direto no cartão. Puxe o alfinete de um cartão até outro para ligá-los;
        solte no vazio para criar um cartão já ligado. Tudo fica no seu rascunho: os jogadores só recebem o mural quando você publicar.
      </p>
      <div className="clue-keys">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="menu-title">{g.title}</h3>
            <dl>
              {g.rows.map(([keys, label]) => (
                <Fragment key={label}>
                  <dt>{keys.map((k, i) => <Fragment key={k}>{i > 0 && <span className="muted"> + </span>}<kbd>{k}</kbd></Fragment>)}</dt>
                  <dd>{label}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
