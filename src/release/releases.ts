// Versões do EVA 3 e as notas de cada uma, da mais nova para a mais antiga.
// Formato MAIOR.MENOR.AJUSTE: o último número sobe com ajustes pequenos (correções, retoques);
// o do meio sobe com mudanças significativas (recursos novos, mudanças de regra) e zera o último.
// A primeira entrada é a versão atual; o package.json acompanha (há teste conferindo).
// As notas são para quem joga: só o que muda no uso, sem detalhes técnicos.

export interface Release {
  version: string;
  /** Data no formato AAAA-MM-DD. */
  date: string;
  /** Resumo de uma linha da atualização. */
  title: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '3.2.0',
    date: '2026-11-27',
    title: 'Mudar o nome do personagem',
    notes: [
      'O jogador pode mudar o nome do próprio personagem pelo lápis ao lado do nome, na ficha.',
      'O mestre também pode mudar o nome dos personagens dos jogadores e dos NPCs.',
      'A troca de nome de um personagem aparece no registro da mesa.',
    ],
  },
  {
    version: '3.1.1',
    date: '2026-11-27',
    title: 'Versão de lançamento',
    notes: [
      'Mesas online: o mestre cria a sala e os jogadores entram pelo código, link ou QR, do computador ou do celular.',
      'Fichas com atributos, classes, títulos, classes especialistas e habilidades, montadas no assistente e aprovadas pelo mestre.',
      'Permissões por ação (livre, solicitar ou bloqueada), com pedidos que o mestre aprova na aba Admin.',
      'Itens com durabilidade e equipamento, NPCs, ameaças, mapas com combate por turnos, investigação com mural de pistas e relações.',
      'Trilha sonora do YouTube na tela do mestre, backup da mesa em arquivo e o manual de regras na aba Regras.',
    ],
  },
];

export const VERSION = RELEASES[0].version;

/** Data da versão em português (ex.: 27/11/2026). */
export const releaseDate = (r: Release) => r.date.split('-').reverse().join('/');
