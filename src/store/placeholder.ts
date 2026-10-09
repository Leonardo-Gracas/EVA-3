// Campanha de exemplo: mesa nova com biblioteca de itens e ameaças padrão.
// Tudo entra pelo motor (library/upsert, threat/upsert), então passa pelas
// mesmas validações de uma mesa jogada de verdade.
import type { Actor, ItemData, ItemEffects, ItemSlot, ItemType, TableState, ThreatAbility, ThreatAttack, ThreatData } from '../model/types';
import { DEFAULT_DURABILITY, DEFAULT_SLOT, NO_EFFECTS } from '../model/types';
import type { Attributes } from '../rules/attributes';
import { defaultCtx, dispatch, newTable, type EngineCtx } from './engine';

// ── Itens ────────────────────────────────────────────────────────────────────

function item(
  type: ItemType, name: string, damage: string, value: number, description: string,
  opts: { slot?: ItemSlot; effects?: Partial<ItemEffects>; durability?: Partial<ItemData['durability']>; pack?: number } = {},
): ItemData {
  return {
    name, type, damage, value, description,
    slot: opts.slot ?? DEFAULT_SLOT[type],
    effects: { ...NO_EFFECTS, ...opts.effects },
    durability: { ...DEFAULT_DURABILITY[type], ...opts.durability },
    pack: opts.pack ?? 1,
  };
}

const LAMINAS: ItemData[] = [
  item('arma', 'Faca', '1d4', 5, 'Lâmina curta de uso diário. Fácil de esconder. Pode ser arremessada (alcance curto).', { durability: { pv: 6, rd: 4 } }),
  item('arma', 'Adaga', '1d4+1', 15, 'Lâmina de dois gumes, feita para perfurar. Pode ser arremessada (alcance curto).', { durability: { pv: 8, rd: 5 } }),
  item('arma', 'Facão', '1d6', 12, 'Lâmina larga de mato. Corta corda, galho e gente com a mesma má vontade.'),
  item('arma', 'Espada curta', '1d6', 40, 'Lâmina reta de uma mão, boa em espaços fechados.', { durability: { pv: 12, rd: 6 } }),
  item('arma', 'Sabre', '1d8', 60, 'Lâmina curva de cavalaria, de corte rápido. Uma mão.', { durability: { pv: 12, rd: 6 } }),
  item('arma', 'Espada longa', '1d8', 80, 'Lâmina reta de uma mão; com as duas, causa 1d10.', { durability: { pv: 15, rd: 6 } }),
  item('arma', 'Montante', '2d6', 150, 'Espada de duas mãos, pesada e longa. Exige FOR +1 para usar sem desvantagem.', { slot: 'duas_maos', durability: { pv: 18, rd: 7 } }),
  item('arma', 'Lança', '1d8', 20, 'Haste com ponta de metal. Duas mãos; alcance de 3 m. Pode ser arremessada.', { slot: 'duas_maos', durability: { pv: 10, rd: 4 } }),
];

const IMPACTO: ItemData[] = [
  item('arma', 'Cassetete', '1d6', 15, 'Bastão policial. Pode bater para derrubar em vez de ferir.', { durability: { pv: 12, rd: 5 } }),
  item('arma', 'Taco de beisebol', '1d6', 10, 'Madeira maciça. Duas mãos.', { slot: 'duas_maos', durability: { pv: 10, rd: 3 } }),
  item('arma', 'Pé de cabra', '1d6', 12, 'Ferramenta e arma. +5 em testes de FOR para arrombar.', { durability: { pv: 15, rd: 8 } }),
  item('arma', 'Maça', '1d8', 45, 'Cabeça de metal flangeada. Uma mão.', { durability: { pv: 15, rd: 7 } }),
  item('arma', 'Martelo de guerra', '1d8+1', 70, 'Martelo de combate com bico do lado oposto. Uma mão.', { durability: { pv: 16, rd: 8 } }),
  item('arma', 'Marreta', '1d10', 25, 'Cabeça de ferro de construção. Duas mãos; lenta e devastadora.', { slot: 'duas_maos', durability: { pv: 18, rd: 8 } }),
  item('arma', 'Machadinha', '1d6', 15, 'Machado de uma mão. Pode ser arremessado (alcance curto).'),
  item('arma', 'Machado', '1d10', 40, 'Machado de lenhador. Duas mãos.', { slot: 'duas_maos', durability: { pv: 14, rd: 6 } }),
];

const DISTANCIA: ItemData[] = [
  item('arma', 'Arco curto', '1d6', 30, 'Duas mãos; alcance médio. Usa flechas.', { slot: 'duas_maos', durability: { pv: 6, rd: 2 } }),
  item('arma', 'Besta', '1d10', 60, 'Duas mãos; alcance médio. Recarregar gasta uma ação de movimentação. Usa virotes.', { slot: 'duas_maos', durability: { pv: 8, rd: 3 } }),
  item('arma', 'Revólver .38', '2d6', 120, 'Seis tiros no tambor. Alcance curto. Recarga lenta (uma ação).', { durability: { pv: 10, rd: 6 } }),
  item('arma', 'Pistola 9 mm', '2d6', 150, 'Pente de 15. Alcance curto. Troca de pente com ação de movimentação.', { durability: { pv: 10, rd: 6 } }),
  item('arma', 'Escopeta calibre 12', '3d6', 250, 'Duas mãos. Alcance curto; à queima-roupa causa +1d6. Dois cartuchos por recarga.', { slot: 'duas_maos', durability: { pv: 12, rd: 6 } }),
  item('arma', 'Escopeta de cano serrado', '3d6', 180, 'Cabe sob o casaco. Só alcance curto, em cone: atinge até dois alvos adjacentes.', { durability: { pv: 10, rd: 5 } }),
  item('arma', 'Rifle de caça', '2d8', 300, 'Duas mãos; alcance longo. Ferrolho: um tiro por turno. Mira telescópica.', { slot: 'duas_maos', durability: { pv: 12, rd: 6 } }),
  item('arma', 'Submetralhadora', '2d6', 450, 'Rajada: gaste 3 balas para +1d6 de dano ou para atacar dois alvos próximos.', { durability: { pv: 10, rd: 6 } }),
  item('arma', 'Fuzil de assalto', '2d8', 700, 'Duas mãos; alcance longo. Rajada: gaste 3 balas para +1d8 de dano.', { slot: 'duas_maos', durability: { pv: 14, rd: 7 } }),
];

const MUNICAO: ItemData[] = [
  item('municao', 'Flechas', '', 5, 'Aljava com 20 flechas para arco.', { pack: 20 }),
  item('municao', 'Virotes', '', 8, 'Estojo com 20 virotes para besta.', { pack: 20 }),
  item('municao', 'Balas .38', '', 20, 'Caixa com 50 balas para revólver .38.', { pack: 50 }),
  item('municao', 'Balas 9 mm', '', 25, 'Caixa com 50 balas para pistola e submetralhadora.', { pack: 50 }),
  item('municao', 'Cartuchos calibre 12', '', 30, 'Caixa com 25 cartuchos de chumbo grosso.', { pack: 25 }),
  item('municao', 'Munição de fuzil', '', 45, 'Pente com 30 balas para fuzil ou rifle.', { pack: 30 }),
  item('municao', 'Balas de prata', '', 120, 'Seis balas de prata, para qualquer arma de fogo de calibre comum. Ferem criaturas que a munição comum não fere.', { pack: 6 }),
];

const PROTECAO: ItemData[] = [
  item('protecao', 'Jaqueta de couro grosso', '', 40, 'Couro curtido, discreto na rua.', { effects: { rdPhysical: 1 }, durability: { pv: 12, rd: 2 } }),
  item('protecao', 'Cota de malha', '', 150, 'Anéis de aço entrelaçados sob a roupa. Barulhenta.', { effects: { rdPhysical: 3, def: -1 }, durability: { pv: 25, rd: 6 } }),
  item('protecao', 'Colete balístico', '', 300, 'Colete de kevlar, usado sob a roupa. Contra armas de fogo, a RD dobra.', { effects: { rdPhysical: 2 }, durability: { pv: 20, rd: 5 } }),
  item('protecao', 'Colete tático com placas', '', 600, 'Placas de cerâmica e bolsos para pentes. Pesado e chamativo.', { effects: { rdPhysical: 4, def: -1 }, durability: { pv: 30, rd: 8 } }),
  item('protecao', 'Armadura de placas', '', 900, 'Aço da cabeça aos pés. Proteção máxima, mobilidade mínima: deslocamento −3 m.', { effects: { rdPhysical: 6, def: -2 }, durability: { pv: 40, rd: 10 } }),
  item('protecao', 'Hábito consagrado', '', 250, 'Veste abençoada em ritual. Não para golpes, mas afasta o sobrenatural.', { effects: { rdMagic: 2 }, durability: { pv: 8, rd: 1 } }),
  item('protecao', 'Manto de runas', '', 400, 'Tecido bordado com fios de chumbo em padrões ocultos.', { effects: { rdMagic: 3, rdPhysical: 1 }, durability: { pv: 10, rd: 2 } }),
];

const ESCUDOS: ItemData[] = [
  item('escudo', 'Broquel', '1d4', 20, 'Escudo pequeno de punho. Ocupa uma mão.', { effects: { def: 1 }, durability: { pv: 10, rd: 6 } }),
  item('escudo', 'Escudo de madeira', '1d4', 25, 'Escudo redondo com bossa de metal.', { effects: { def: 2 }, durability: { pv: 15, rd: 4 } }),
  item('escudo', 'Escudo de aço', '1d4', 90, 'Escudo pesado de aço.', { effects: { def: 2, rdPhysical: 1 }, durability: { pv: 25, rd: 10 } }),
  item('escudo', 'Escudo balístico', '', 500, 'Escudo policial com visor. Contra armas de fogo, conta também como cobertura.', { effects: { def: 3, rdPhysical: 1 }, durability: { pv: 30, rd: 12 } }),
];

const CATALISADORES: ItemData[] = [
  item('catalisador_sagrado', 'Crucifixo de prata', '', 60, 'Crucifixo abençoado. Catalisador sagrado para Repreender, Curar e afins.'),
  item('catalisador_sagrado', 'Rosário', '', 25, 'Contas de madeira gastas por anos de oração. Catalisador sagrado.'),
  item('catalisador_sagrado', 'Livro de orações', '', 40, 'Breviário anotado à mão. Catalisador sagrado.', { durability: { pv: 4, rd: 0 } }),
  item('catalisador_sagrado', 'Relicário', '', 300, 'Contém o fragmento de um santo. Catalisador sagrado. Uma vez por dia, +2 num teste de FÉ.', { slot: 'veste', durability: { pv: 8, rd: 4 } }),
  item('catalisador_profano', 'Grimório encadernado em couro', '', 200, 'Páginas que não deveriam existir. Catalisador profano.', { durability: { pv: 4, rd: 0 } }),
  item('catalisador_profano', 'Ídolo de osso', '', 80, 'Figura talhada em osso humano. Catalisador profano.'),
  item('catalisador_profano', 'Adaga ritual', '1d4', 120, 'Lâmina negra usada em sacrifícios. Catalisador profano; também serve como arma.', { durability: { pv: 8, rd: 4 } }),
  item('catalisador_etereo', 'Pêndulo de cristal', '', 50, 'Oscila sozinho perto do outro plano. Catalisador etéreo.'),
  item('catalisador_etereo', 'Baralho de tarô', '', 35, 'Cartas antigas, uma delas sempre fora do lugar. Catalisador etéreo.', { durability: { pv: 2, rd: 0 } }),
  item('catalisador_etereo', 'Espelho negro', '', 150, 'Obsidiana polida. Reflete o que não está na sala. Catalisador etéreo.', { durability: { pv: 3, rd: 2 } }),
];

const CONSUMIVEIS: ItemData[] = [
  item('consumivel', 'Kit de primeiros socorros', '', 30, 'Cinco usos. Uma ação: recupera 1d6 PV de um aliado (INT(15) para recuperar +1d4).', { pack: 5 }),
  item('consumivel', 'Bandagens', '', 5, 'Estanca sangramento. Uma ação: recupera 1 PV e encerra Sangrando.'),
  item('consumivel', 'Água benta', '1d6', 20, 'Frasco arremessável (alcance curto). Causa 1d6 de dano sagrado em criaturas malignas.'),
  item('consumivel', 'Sal grosso (saco)', '', 3, 'Uma linha de sal que entidades menores não atravessam.'),
  item('consumivel', 'Coquetel molotov', '2d6', 10, 'Arremesso (alcance curto). 2d6 de fogo na área e 1d6 por rodada até apagar.'),
  item('consumivel', 'Granada de fragmentação', '4d6', 200, 'Arremesso (alcance médio). 4d6 em raio de 5 m; DES(15) reduz à metade.'),
  item('consumivel', 'Sinalizador', '1d4', 8, 'Ilumina 30 m por 10 minutos. Arremessado, causa 1d4 de fogo.'),
  item('consumivel', 'Seringa de adrenalina', '', 60, 'Uma ação: quem está com 0 PV ou menos volta a 1 PV e acorda. Uma vez por dia por pessoa.'),
];

const EQUIPAMENTOS: ItemData[] = [
  item('equipamento', 'Lanterna tática', '', 15, 'Feixe forte, alcance de 30 m. Pode ofuscar: DES(15) do alvo ou perde a próxima ação.', { slot: 'uma_mao' }),
  item('equipamento', 'Kit de arrombamento', '', 50, 'Gazuas e tensores. +5 em testes de DES para abrir fechaduras.', { slot: 'uma_mao' }),
  item('equipamento', 'Kit de ferramentas', '', 40, 'Chaves, alicates e chaves de fenda. +5 para consertar ou desmontar mecanismos.', { slot: 'uma_mao' }),
  item('equipamento', 'Kit forense', '', 120, 'Pó revelador, luvas, sacos de evidência e luz UV. +5 em INT para examinar cenas.', { slot: 'uma_mao' }),
  item('equipamento', 'Corda (15 m)', '', 5, 'Corda de náilon com nó para escalada.', { durability: { pv: 4, rd: 0 } }),
  item('equipamento', 'Rádio comunicador (par)', '', 80, 'Alcance de 3 km em área aberta. Chia perto de presenças.'),
  item('equipamento', 'Binóculo', '', 30, 'Visão nítida a até 1 km.', { slot: 'uma_mao' }),
  item('equipamento', 'Câmera fotográfica', '', 90, 'Registra o que o olho não vê: às vezes aparece algo a mais na foto.', { slot: 'uma_mao' }),
  item('equipamento', 'Gravador de áudio', '', 40, 'Grava até 10 horas. Útil para psicofonias.', { slot: 'uma_mao' }),
  item('equipamento', 'Máscara de gás', '', 70, 'Imune a gases e fumaça por 1 hora por filtro.'),
  item('equipamento', 'Óculos de visão noturna', '', 400, 'Enxerga no escuro até 30 m. Luz forte ofusca quem usa.'),
  item('equipamento', 'Mochila', '', 10, 'Carrega o que não cabe nos bolsos.'),
  item('equipamento', 'Isqueiro', '', 2, 'Fogo à mão.', { slot: 'uma_mao', durability: { pv: 2, rd: 1 } }),
];

export const PLACEHOLDER_ITEMS: ItemData[] = [
  ...LAMINAS, ...IMPACTO, ...DISTANCIA, ...MUNICAO, ...PROTECAO, ...ESCUDOS, ...CATALISADORES, ...CONSUMIVEIS, ...EQUIPAMENTOS,
];

// ── Ameaças ──────────────────────────────────────────────────────────────────
// Inimigos humanos por força, pensados para um grupo de 3–4 personagens de nível 1:
// Fraco (em bando), Comum (um por personagem), Forte (um para o grupo),
// Elite (luta difícil) e Chefe (encerra um arco). A força abre a descrição,
// para buscar por "Fraco", "Elite"... no painel.

type Tier = 'Fraco' | 'Comum' | 'Forte' | 'Elite' | 'Chefe';

// id vazio: o motor gera um ao salvar.
const atk = (name: string, bonus: number, damage: string, notes = ''): ThreatAttack => ({ id: '', name, bonus, damage, notes });
const hab = (name: string, cost: string, text: string): ThreatAbility => ({ id: '', name, cost, text });

function threat(
  tier: Tier, name: string, concept: string, attrs: Partial<Attributes>,
  stats: { pv: number; pe?: number; def: number; von?: number; rd?: number; rdm?: number },
  attacks: ThreatAttack[], abilities: ThreatAbility[] = [], notes = '',
): ThreatData {
  const attributes = { FOR: 0, CON: 0, DES: 0, FE: 0, INT: 0, PRE: 0, ...attrs };
  return {
    name, concept: `${tier} · ${concept}`, attributes,
    pvMax: stats.pv, peMax: stats.pe ?? 0, def: stats.def, von: stats.von ?? 10 + attributes.FE,
    rdPhysical: stats.rd ?? 0, rdMagic: stats.rdm ?? 0,
    attacks, abilities, notes,
  };
}

export const PLACEHOLDER_THREATS: ThreatData[] = [
  // Fracos: caem em um ou dois golpes. Use em bando.
  threat('Fraco', 'Arruaceiro', 'Briga de rua com coragem emprestada do grupo.', { FOR: 1, DES: 0, CON: 0, INT: -1 },
    { pv: 6, def: 10 }, [atk('Soco', 1, '1d3'), atk('Faca', 1, '1d4')], [],
    'Foge quando metade do bando cai.'),
  threat('Fraco', 'Viciado desesperado', 'Faz qualquer coisa pela próxima dose.', { DES: 1, CON: -1, FE: -1 },
    { pv: 5, def: 11 }, [atk('Caco de vidro', 1, '1d4')],
    [hab('Sem nada a perder', '', 'Não faz testes de moral. Ao chegar a 0 PV, faz um último ataque antes de cair.')]),
  threat('Fraco', 'Capanga novato', 'Contratado ontem, ainda acha que é emprego fácil.', { FOR: 1, CON: 1 },
    { pv: 8, def: 11 }, [atk('Taco de beisebol', 2, '1d6'), atk('Revólver .38', 1, '2d6', 'Erra muito: falha crítica com 1 ou 2.')]),
  threat('Fraco', 'Cultista iniciado', 'Túnica nova, fé cega, faca ritual.', { FE: 1, INT: -1 },
    { pv: 6, pe: 2, def: 10 }, [atk('Faca ritual', 1, '1d4')],
    [hab('Cântico', '1 PE', 'Ação de movimentação: um aliado cultista em alcance curto recebe +2 no próximo ataque.')]),

  // Comuns: enfrentam um personagem de igual para igual.
  threat('Comum', 'Capanga armado', 'Pistola na cintura, ordens claras.', { FOR: 1, DES: 2, CON: 1 },
    { pv: 12, def: 12 }, [atk('Pistola 9 mm', 3, '2d6'), atk('Coronhada', 2, '1d4+1')], [],
    'Procura cobertura antes de atirar.'),
  threat('Comum', 'Segurança particular', 'Terno, ponto no ouvido e colete por baixo.', { FOR: 2, CON: 2, DES: 1 },
    { pv: 14, def: 11, rd: 2 }, [atk('Cassetete', 3, '1d6+1'), atk('Pistola 9 mm', 2, '2d6')],
    [hab('Chamar reforços', '', 'Ação: pelo rádio, chega 1 segurança a cada 2 rodadas até o alarme ser cortado.')]),
  threat('Comum', 'Policial', 'Treinado, armado e com a lei do lado dele.', { FOR: 1, DES: 2, CON: 1, INT: 1 },
    { pv: 14, def: 12, rd: 2 }, [atk('Pistola 9 mm', 4, '2d6'), atk('Cassetete', 2, '1d6')],
    [hab('Voz de prisão', '', 'Ação de movimentação: alvo em alcance curto faz PRE(15) ou perde a próxima ação de movimentação.')]),
  threat('Comum', 'Cultista devoto', 'Já viu o que o culto promete e quer mais.', { FE: 2, INT: 1, PRE: 1 },
    { pv: 10, pe: 6, def: 11, rdm: 1 }, [atk('Adaga ritual', 2, '1d4+1')],
    [hab('Praga menor', '2 PE', 'Alvo em alcance curto: 2d6 de dano profano. FÉ(15) reduz à metade.')]),
  threat('Comum', 'Caçador', 'Conhece a mata melhor que a própria casa.', { DES: 2, CON: 1, PRE: 2 },
    { pv: 12, def: 12 }, [atk('Rifle de caça', 4, '2d8', 'Alcance longo; um tiro por turno.'), atk('Facão', 2, '1d6+1')],
    [hab('Rastreador', '', 'Sempre sabe onde estão os personagens a até 50 m, mesmo escondidos.')]),

  // Fortes: um só segura o grupo por algumas rodadas.
  threat('Forte', 'Brutamontes', 'Grande demais para portas e paciência.', { FOR: 4, CON: 3, DES: -1, INT: -1 },
    { pv: 28, def: 9, rd: 2 }, [atk('Marreta', 5, '1d10+4'), atk('Agarrar', 5, '1d4+4', 'Acerto: o alvo fica agarrado (FOR(16) para escapar).')],
    [hab('Investida', '', 'Move até 9 m e ataca; se acertar, o alvo cai no chão.')]),
  threat('Forte', 'Matador de aluguel', 'Profissional. Não erra o primeiro tiro.', { DES: 3, INT: 2, PRE: 1 },
    { pv: 20, def: 14, rd: 1 }, [atk('Pistola com silenciador', 5, '2d6+2'), atk('Faca de combate', 4, '1d4+3')],
    [hab('Emboscada', '', 'Contra alvo surpreso ou que ainda não agiu no combate, o dano é dobrado.'),
      hab('Saída de emergência', '', 'Com metade do PV, foge na primeira oportunidade.')]),
  threat('Forte', 'Mercenário', 'Ex-militar, equipamento de guerra, sem bandeira.', { FOR: 2, DES: 2, CON: 2 },
    { pv: 22, def: 12, rd: 4 }, [atk('Fuzil de assalto', 5, '2d8', 'Rajada: +1d8 de dano, gasta 3 balas.'), atk('Granada', 3, '4d6', 'Uma por combate. Raio de 5 m; DES(15) reduz à metade.')],
    [hab('Disciplina', '', 'Ignora a primeira condição de medo ou controle mental que sofrer no combate.')]),
  threat('Forte', 'Sacerdote do culto', 'Prega sobre o fim do mundo e acredita nele.', { FE: 3, INT: 2, PRE: 2 },
    { pv: 16, pe: 15, def: 11, rdm: 3 }, [atk('Adaga ritual', 2, '1d4+1')],
    [hab('Praga', '5 PE e 2 PV', 'Alvo em alcance médio: 4d6 de dano profano. FÉ(20) reduz à metade.'),
      hab('Fervor', '3 PE', 'Todos os cultistas em alcance curto recebem +2 nos ataques por 2 rodadas.'),
      hab('Escudo de fiéis', '', 'Um cultista adjacente pode receber o ataque no lugar dele.')]),

  // Elite: luta difícil para o grupo inteiro.
  threat('Elite', 'Comandante mercenário', 'Planeja a luta antes de ela começar.', { FOR: 2, DES: 3, CON: 3, INT: 3 },
    { pv: 40, pe: 6, def: 15, rd: 5 }, [atk('Fuzil de assalto', 7, '2d8+2', 'Rajada: +1d8 de dano.'), atk('Faca de combate', 6, '1d6+2')],
    [hab('Ordens', '2 PE', 'Ação de movimentação: até dois aliados podem mover ou atacar imediatamente.'),
      hab('Tática', '', 'Recebe +2 de DEF enquanto houver um aliado adjacente.')]),
  threat('Elite', 'Assassina da Ordem', 'Treinada desde a infância para matar o que caça.', { DES: 4, INT: 2, PRE: 3, FE: 2 },
    { pv: 30, pe: 10, def: 17, rd: 2, rdm: 2 }, [atk('Lâminas gêmeas', 7, '1d6+3', 'Ataca duas vezes por turno.'), atk('Facas de arremesso', 6, '1d4+3', 'Alcance curto.')],
    [hab('Sombra', '2 PE', 'Fica invisível até o próximo ataque. O primeiro ataque vindo da sombra é crítico com 17+.'),
      hab('Reflexos', '', 'Uma vez por rodada, reduz à metade o dano de um ataque que a atingiu.')]),
  threat('Elite', 'Inquisidor renegado', 'Acólito que decidiu que todo mundo é herege.', { FOR: 2, CON: 3, FE: 4, PRE: 2 },
    { pv: 36, pe: 18, def: 13, rd: 4, rdm: 5 }, [atk('Martelo de guerra consagrado', 6, '1d8+4', '+1d6 sagrado contra quem usa magia profana.'), atk('Escopeta calibre 12', 4, '3d6')],
    [hab('Repreender', '2 PE', 'Teste de FÉ contra a VON do alvo: 2d6 de dano sagrado, crítico 18.'),
      hab('Juízo', '5 PE', 'Alvo em alcance curto faz FÉ(20) ou fica imóvel por 1 rodada.'),
      hab('Inabalável', '', 'Não fica inconsciente com 0 PV; continua lutando até o limite de morte.')]),
  threat('Elite', 'Ocultista renegado', 'Aprendeu demais, rápido demais, com quem não devia.', { INT: 4, FE: 1, PRE: 2, CON: 1 },
    { pv: 26, pe: 24, def: 12, rd: 1, rdm: 4 }, [atk('Toque de chamas', 6, '2d6', 'Alcance de toque.')],
    [hab('Explosão de chamas', '3 PE', 'Alcance curto: 3d6 de fogo em um alvo.'),
      hab('Alterar temperatura', '5 PE', 'Alcance médio: 6 + 1d6 de fogo ou frio. FÉ(20) reduz à metade.'),
      hab('Escudo arcano', '2 PE', 'Reação: +4 de DEF contra um ataque.')]),

  // Chefes: o fim de um arco. Quase sempre acompanhados.
  threat('Chefe', 'Chefão do crime', 'Dono do bairro. Nunca suja as mãos se puder evitar.', { FOR: 1, DES: 2, CON: 2, INT: 3, PRE: 4 },
    { pv: 45, pe: 10, def: 14, rd: 4 }, [atk('Revólver banhado a ouro', 6, '2d6+3'), atk('Bengala com lâmina', 5, '1d8+2')],
    [hab('Sempre acompanhado', '', 'Entra em combate com 2 capangas armados e 1 brutamontes.'),
      hab('Escudo humano', '', 'Reação: um capanga adjacente recebe o ataque no lugar dele.'),
      hab('Proposta', '3 PE', 'Alvo em alcance curto faz INT(18) ou para de atacá-lo por 1 rodada para ouvir.')],
    'Prefere negociar, subornar ou fugir a morrer. Tem informação valiosa.'),
  threat('Chefe', 'Sumo-sacerdote', 'A voz do que o culto adora. Ou sua boca.', { FE: 5, INT: 3, PRE: 4, CON: 2 },
    { pv: 55, pe: 35, def: 13, von: 18, rd: 3, rdm: 6 }, [atk('Cajado de osso', 5, '1d8+3'), atk('Toque profano', 7, '2d8', 'Dano profano.')],
    [hab('Praga maior', '5 PE e 5 PV', 'Alvo em alcance médio: 6d6 de dano profano. FÉ(25) reduz à metade.'),
      hab('Sacrifício', '', 'Reação: quando um cultista morre em alcance curto, recupera 5 PE ou 10 PV.'),
      hab('Profanar', '8 PE', 'Área de 10 m vira solo profano por 3 rodadas: personagens recebem −2 em todos os testes.'),
      hab('Duas ações', '', 'Age duas vezes por rodada, em iniciativas diferentes.')],
    'Ao cair, algo do outro lado olha pelo corpo dele por um instante.'),
  threat('Chefe', 'Caçador de bruxas veterano', 'Trinta anos matando o que se esconde no escuro. E quem o protege.', { FOR: 3, DES: 3, CON: 4, FE: 3, INT: 2 },
    { pv: 60, pe: 15, def: 15, rd: 5, rdm: 5 }, [atk('Espada longa de prata', 8, '1d10+5', 'Ignora RD de criaturas sobrenaturais.'), atk('Escopeta com balas de prata', 7, '3d6+2')],
    [hab('Dois golpes', '', 'Ataca duas vezes por turno.'),
      hab('Já vi isso antes', '', 'Uma vez por rodada, anula uma habilidade sobrenatural usada contra ele (o PE é gasto).'),
      hab('Armadilhas', '', 'Chega em combate com o terreno preparado: personagens que se movem pela primeira vez fazem DES(16) ou sofrem 2d6.')]),
];

// ── Mesa ─────────────────────────────────────────────────────────────────────

export const PLACEHOLDER_NAME = 'Campanha de exemplo';

export function placeholderTable(gmName: string, roomCode: string, ctx: EngineCtx = defaultCtx): TableState {
  let s = newTable(PLACEHOLDER_NAME, gmName, roomCode, ctx);
  // O painel lista ameaças por criação: um relógio crescente mantém a ordem por força.
  let clock = s.createdAt;
  const seed: EngineCtx = { ...ctx, now: () => clock++ };
  const gm: Actor = { role: 'gm', name: gmName };
  const run = (a: Parameters<typeof dispatch>[2], what: string) => {
    const r = dispatch(s, gm, a, seed);
    if (!r.ok) throw new Error(`Campanha de exemplo: ${what}: ${r.error}`);
    s = r.state;
  };
  for (const item of PLACEHOLDER_ITEMS) run({ type: 'library/upsert', item }, item.name);
  for (const data of PLACEHOLDER_THREATS) run({ type: 'threat/upsert', data }, data.name);
  return s;
}
