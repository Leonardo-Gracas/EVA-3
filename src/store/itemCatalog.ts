// Catálogo de itens: a base dos conjuntos de itens (ver itemSets.ts), que o mestre
// importa na biblioteca. Tudo entra pelo motor (library/upsert), então passa pelas
// mesmas validações de um item criado à mão.
import type { ItemData, ItemEffects, ItemSlot, ItemType } from '../model/types';
import { DEFAULT_DURABILITY, DEFAULT_SLOT, NO_EFFECTS } from '../model/types';

// ── Itens ────────────────────────────────────────────────────────────────────

export function item(
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
  item('consumivel', 'Seringa de adrenalina', '', 60, 'Uma ação: quem está com 0 PV ou menos volta a 1 PV e acorda. Uma vez por dia por pessoa.'),
];

const EQUIPAMENTOS: ItemData[] = [
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
];

/** Equipados (e inteiros), iluminam em volta do personagem no mapa. Raio em quadrados de 1,5 m. */
export const LIGHT_ITEMS: ItemData[] = [
  item('equipamento', 'Tocha', '1d4', 1, 'Pano embebido em óleo num cabo de madeira. Acesa, ilumina 7,5 m em volta por cerca de uma hora. Golpeada, causa 1d4 de fogo.', { slot: 'uma_mao', effects: { light: 5 }, durability: { pv: 3, rd: 0 } }),
  item('equipamento', 'Lamparina', '', 4, 'Pequena lâmpada de lata com pavio e óleo. Ilumina 4,5 m em volta; dura umas quatro horas. Derrubada, o óleo pega fogo.', { slot: 'uma_mao', effects: { light: 3 }, durability: { pv: 2, rd: 0 } }),
  item('equipamento', 'Lampião a óleo', '', 12, 'Lanterna de vidro com pavio e alça. Ilumina 6 m em volta; o óleo dura umas seis horas.', { slot: 'uma_mao', effects: { light: 4 }, durability: { pv: 3, rd: 0 } }),
  item('equipamento', 'Castiçal com vela', '', 6, 'Castiçal de latão com uma vela grossa. Ilumina 3 m em volta; a vela dura umas três horas. Apaga com vento forte.', { slot: 'uma_mao', effects: { light: 2 }, durability: { pv: 4, rd: 2 } }),
  item('equipamento', 'Candelabro de mão', '', 25, 'Três braços com velas. Ilumina 4,5 m em volta. Pesado e chamativo.', { slot: 'uma_mao', effects: { light: 3 }, durability: { pv: 6, rd: 3 } }),
  item('equipamento', 'Lanterna de pilha', '', 8, 'Lanterna comum. Ilumina 9 m; as pilhas duram umas cinco horas.', { slot: 'uma_mao', effects: { light: 6 }, durability: { pv: 3, rd: 1 } }),
  item('equipamento', 'Lanterna de cabeça', '', 20, 'Presa na testa: ilumina 6 m sem ocupar as mãos. As pilhas duram umas oito horas.', { slot: 'veste', effects: { light: 4 }, durability: { pv: 2, rd: 0 } }),
  item('equipamento', 'Lanterna tática', '', 15, 'Feixe forte, alcance de 30 m (ilumina 12 m em volta no mapa). Pode ofuscar: DES(15) do alvo ou perde a próxima ação.', { slot: 'uma_mao', effects: { light: 8 } }),
  item('equipamento', 'Holofote portátil', '', 120, 'Refletor de bateria, pesado. Duas mãos; ilumina 18 m. A bateria dura cerca de uma hora.', { slot: 'duas_maos', effects: { light: 12 }, durability: { pv: 6, rd: 2 } }),
  item('equipamento', 'Isqueiro', '', 2, 'Fogo à mão. Aceso, ilumina o quadrado de quem segura e os vizinhos.', { slot: 'uma_mao', effects: { light: 1 }, durability: { pv: 2, rd: 1 } }),
  item('consumivel', 'Caixa de fósforos', '', 1, 'Vinte fósforos. Cada um ilumina o quadrado e os vizinhos por alguns segundos.', { pack: 20, effects: { light: 1 } }),
  item('consumivel', 'Velas', '', 2, 'Maço de seis velas de sebo. Acesa, ilumina 3 m em volta; cada uma dura cerca de uma hora.', { pack: 6, effects: { light: 2 } }),
  item('consumivel', 'Bastões de luz química', '', 12, 'Dobre e agite: luz verde e fria por umas seis horas, 4,5 m em volta. Não esquenta nem apaga com água.', { pack: 4, effects: { light: 3 } }),
  item('consumivel', 'Sinalizador', '1d4', 8, 'Ilumina 30 m por 10 minutos. Arremessado, causa 1d4 de fogo.', { effects: { light: 20 } }),
];

/** Todos os itens do catálogo; cada um está em ao menos um conjunto. */
export const CATALOG_ITEMS: ItemData[] = [
  ...LAMINAS, ...IMPACTO, ...DISTANCIA, ...MUNICAO, ...PROTECAO, ...ESCUDOS, ...CATALISADORES, ...CONSUMIVEIS, ...EQUIPAMENTOS, ...LIGHT_ITEMS,
];
