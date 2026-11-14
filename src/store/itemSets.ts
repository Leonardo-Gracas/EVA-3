// Conjuntos de itens para importar na biblioteca do mestre (modal "Conjuntos de itens").
// Cada conjunto reaproveita itens do catálogo (itemCatalog.ts) pelo nome (mesmo item, mesmos números)
// e soma os da sua época. Importar só traz o que a biblioteca ainda não tem, pelo nome.
import type { ItemData, LibraryItem } from '../model/types';
import { installedInSet, nameKey, type SetRemoval } from './catalogSets';
import { CATALOG_ITEMS, LIGHT_ITEMS, item } from './itemCatalog';

export type ItemSetId = 'iluminacao' | 'medieval' | 'old_school' | 'contemporaneo' | 'ocultismo';

export interface ItemSet {
  id: ItemSetId;
  name: string;
  description: string;
  items: ItemData[];
}

/** Itens do catálogo pelo nome; nome errado quebra já no carregamento (e no teste). */
function pick(...names: string[]): ItemData[] {
  return names.map((n) => CATALOG_ITEMS.find((i) => i.name === n) ?? (() => { throw new Error(`Conjunto de itens: "${n}" não existe no catálogo.`); })());
}

// ── Medieval ─────────────────────────────────────────────────────────────────

const MEDIEVAL: ItemData[] = [
  // Armas
  ...pick('Adaga', 'Espada curta', 'Espada longa', 'Sabre', 'Montante', 'Lança', 'Maça', 'Martelo de guerra', 'Machadinha', 'Machado', 'Arco curto', 'Besta'),
  item('arma', 'Arco longo', '1d8', 60, 'Teixo da altura de um homem. Duas mãos; alcance longo. Exige FOR +1 para puxar sem desvantagem. Usa flechas.', { slot: 'duas_maos', durability: { pv: 8, rd: 2 } }),
  item('arma', 'Alabarda', '1d10', 70, 'Lâmina de machado e ponta de lança numa haste longa. Duas mãos; alcance de 3 m.', { slot: 'duas_maos', durability: { pv: 14, rd: 6 } }),
  item('arma', 'Mangual', '1d8', 50, 'Bola de ferro com cravos presa por corrente. A corrente contorna o escudo: o alvo não soma a DEF do escudo.', { durability: { pv: 12, rd: 6 } }),
  item('arma', 'Cajado', '1d6', 5, 'Bastão de carvalho ferrado nas pontas. Duas mãos; também serve de apoio na estrada.', { slot: 'duas_maos', durability: { pv: 10, rd: 3 } }),
  item('arma', 'Funda', '1d4', 2, 'Tira de couro para arremessar pedras. Alcance médio. Usa pedras de funda.', { durability: { pv: 3, rd: 0 } }),
  item('arma', 'Picareta', '1d6', 8, 'Ferramenta de mina que fura elmos com a mesma facilidade. Duas mãos; +5 em FOR para cavar e quebrar pedra.', { slot: 'duas_maos', durability: { pv: 14, rd: 7 } }),
  // Munição
  ...pick('Flechas', 'Virotes'),
  item('municao', 'Pedras de funda', '', 1, 'Bolsa com 20 pedras lisas, ou balas de chumbo.', { pack: 20 }),
  // Proteção e escudos
  item('protecao', 'Gibão acolchoado', '', 10, 'Camadas de linho costuradas. Quente e barato.', { effects: { rdPhysical: 1 }, durability: { pv: 10, rd: 1 } }),
  item('protecao', 'Couro batido', '', 45, 'Couro fervido e rebitado. Não faz barulho.', { effects: { rdPhysical: 2 }, durability: { pv: 15, rd: 3 } }),
  ...pick('Cota de malha'),
  item('protecao', 'Meia-armadura', '', 400, 'Peitoral e ombreiras de aço sobre a malha.', { effects: { rdPhysical: 4, def: -1 }, durability: { pv: 30, rd: 8 } }),
  ...pick('Armadura de placas', 'Broquel', 'Escudo de madeira', 'Escudo de aço'),
  item('escudo', 'Escudo torre', '', 120, 'Escudo de corpo inteiro. Deslocamento −1,5 m; parado atrás dele, conta como cobertura.', { effects: { def: 3, rdPhysical: 1 }, durability: { pv: 30, rd: 8 } }),
  // Ferramentas e equipamentos
  ...pick('Tocha', 'Lamparina', 'Castiçal com vela', 'Velas'),
  item('equipamento', 'Pederneira e isca', '', 1, 'Pedra, fuzil de aço e isca seca. Acende fogo em um minuto, se o tempo ajudar.'),
  item('equipamento', 'Corda de cânhamo (15 m)', '', 1, 'Grossa e áspera. Aguenta três pessoas.', { durability: { pv: 4, rd: 0 } }),
  item('equipamento', 'Gancho de escalada', '', 3, 'Garra de ferro de três dentes para prender a corda em muros e beirais.', { durability: { pv: 8, rd: 5 } }),
  item('equipamento', 'Ferramentas de ladrão', '', 25, 'Gazuas, ganchos e uma lima fina num rolo de couro. +5 em DES para abrir fechaduras.', { slot: 'uma_mao' }),
  item('equipamento', 'Pá', '', 2, 'Cabo de madeira e lâmina de ferro. Duas mãos; abre uma cova em uma hora.', { slot: 'duas_maos', durability: { pv: 8, rd: 4 } }),
  item('equipamento', 'Grilhões', '', 8, 'Algemas de ferro com corrente curta. FOR(20) para arrebentar; DES(18) com gazua para abrir.', { durability: { pv: 12, rd: 8 } }),
  item('equipamento', 'Pena, tinta e pergaminho', '', 2, 'Estojo de escrita com dez folhas.', { durability: { pv: 1, rd: 0 } }),
  item('equipamento', 'Rolo de cama', '', 1, 'Manta e cobertor amarrados. Dormir no chão sem ele não conta como descanso completo.'),
  item('equipamento', 'Odre', '', 1, 'Bolsa de couro para dois litros de água ou vinho.', { durability: { pv: 2, rd: 0 } }),
  item('equipamento', 'Alforje de couro', '', 2, 'Bolsa dupla para a sela ou o ombro.'),
  // Consumíveis
  item('consumivel', 'Rações de viagem', '', 5, 'Pão duro, queijo e carne-seca para uma semana.', { pack: 7 }),
  item('consumivel', 'Frasco de óleo', '1d4', 1, 'Abastece a lamparina por quatro horas. Arremessado e aceso, 1d4 de fogo e o chão queima por uma rodada.'),
  item('consumivel', 'Unguento de ervas', '', 25, 'Pomada de confrei e mel. Uma ação: recupera 2d4 PV. Uma vez por descanso por pessoa.'),
  item('consumivel', 'Veneno de lâmina', '', 50, 'Uma ação para untar a arma: o próximo acerto causa +1d6, e o alvo faz CON(14) ou fica Envenenado.'),
  ...pick('Bandagens', 'Água benta', 'Relicário'),
];

// ── Old School (anos 1920 a 1950) ────────────────────────────────────────────

const OLD_SCHOOL: ItemData[] = [
  // Armas
  item('arma', 'Navalha', '1d4', 3, 'Navalha de barbeiro dobrável. Fácil de esconder; um corte rápido faz o alvo sangrar.', { durability: { pv: 4, rd: 3 } }),
  item('arma', 'Soco-inglês', '1d4', 5, 'Anéis de latão no punho. Conta como desarmado, mas o soco fere de verdade.', { slot: 'veste', durability: { pv: 10, rd: 8 } }),
  item('arma', 'Bengala-espada', '1d6', 35, 'Bengala de cavalheiro com uma lâmina fina escondida. INT(16) para notar.', { durability: { pv: 8, rd: 4 } }),
  ...pick('Facão', 'Revólver .38'),
  item('arma', 'Derringer', '1d8', 50, 'Pistola de bolso de dois canos. Dois tiros, alcance curtíssimo; cabe na palma da mão.', { durability: { pv: 6, rd: 4 } }),
  item('arma', 'Pistola .45', '2d6+1', 140, 'Pistola militar semiautomática. Pente de 7. Alcance curto.', { durability: { pv: 12, rd: 7 } }),
  item('arma', 'Espingarda de cano duplo', '3d6', 160, 'Duas mãos. Dois tiros antes de recarregar; à queima-roupa causa +1d6. Usa cartuchos calibre 12.', { slot: 'duas_maos', durability: { pv: 12, rd: 6 } }),
  ...pick('Rifle de caça'),
  item('arma', 'Submetralhadora Thompson', '2d6', 500, 'Tambor de 50. Rajada: gaste 3 balas para +1d6 de dano ou para atacar dois alvos próximos. Barulhenta como um desastre.', { slot: 'duas_maos', durability: { pv: 12, rd: 6 } }),
  // Munição
  ...pick('Balas .38', 'Cartuchos calibre 12', 'Munição de fuzil'),
  item('municao', 'Balas .45', '', 25, 'Caixa com 50 balas para pistola .45 e Thompson.', { pack: 50 }),
  // Proteção
  item('protecao', 'Sobretudo de lã pesada', '', 30, 'Lã grossa e gola alta. Esconde bem uma arma.', { effects: { rdPhysical: 1 }, durability: { pv: 10, rd: 1 } }),
  item('protecao', 'Colete de aço', '', 250, 'Placas de aço costuradas sob o paletó, coisa de gângster prevenido.', { effects: { rdPhysical: 3, def: -1 }, durability: { pv: 22, rd: 7 } }),
  // Ferramentas e equipamentos
  ...pick('Lampião a óleo', 'Lanterna de pilha', 'Isqueiro', 'Caixa de fósforos'),
  item('equipamento', 'Câmera de fole', '', 60, 'Chapa de vidro e flash de magnésio. O flash ofusca quem estiver perto: DES(13) ou −2 no próximo teste.', { slot: 'uma_mao', durability: { pv: 3, rd: 0 } }),
  item('equipamento', 'Lupa', '', 5, 'Lente de aumento com cabo de osso. +2 em INT para examinar detalhes.', { slot: 'uma_mao', durability: { pv: 2, rd: 0 } }),
  item('equipamento', 'Kit de impressões digitais', '', 40, 'Pó de grafite, pincel e fita. Colhe digitais em vidro e metal.', { slot: 'uma_mao' }),
  ...pick('Kit de arrombamento', 'Kit de ferramentas', 'Binóculo'),
  item('equipamento', 'Corda de sisal (15 m)', '', 3, 'Corda trançada de fibra.', { durability: { pv: 4, rd: 0 } }),
  item('equipamento', 'Algemas', '', 10, 'Aço niquelado com chave. FOR(22) para arrebentar; DES(18) com gazua para abrir.', { durability: { pv: 12, rd: 8 } }),
  item('equipamento', 'Bússola e mapas', '', 8, 'Bússola de latão e mapas dobrados da região.'),
  item('equipamento', 'Mala de viagem', '', 10, 'Couro e cantos de metal, com fundo falso.'),
  item('equipamento', 'Cantil', '', 2, 'Alumínio forrado de feltro. Um litro de água.'),
  item('catalisador_profano', 'Tratado de ocultismo', '', 90, 'Edição esgotada, com anotações a lápis de um dono anterior. Catalisador profano.', { durability: { pv: 4, rd: 0 } }),
  // Consumíveis
  ...pick('Kit de primeiros socorros'),
  item('consumivel', 'Morfina', '', 30, 'Três ampolas. Uma ação: ignora as penalidades por ferimento por uma hora; INT(14) de quem aplica, senão o paciente apaga.', { pack: 3 }),
  item('consumivel', 'Frasco de uísque', '', 3, 'Um gole: +2 no próximo teste para resistir ao medo.', { pack: 5 }),
  item('consumivel', 'Banana de dinamite', '3d6', 15, 'Pavio de uma rodada. Arremesso (alcance curto): 3d6 em raio de 3 m; DES(15) reduz à metade.'),
];

// ── Contemporâneo ────────────────────────────────────────────────────────────

const CONTEMPORANEO: ItemData[] = [
  // Armas
  ...pick('Faca', 'Cassetete', 'Taco de beisebol', 'Pé de cabra', 'Marreta'),
  item('arma', 'Faca tática', '1d4+1', 25, 'Lâmina serrilhada e cabo emborrachado. Pode ser arremessada (alcance curto).', { durability: { pv: 8, rd: 5 } }),
  item('arma', 'Bastão retrátil', '1d6', 30, 'Abre com um movimento do pulso. Cabe no bolso.', { durability: { pv: 10, rd: 6 } }),
  item('arma', 'Machado de incêndio', '1d10', 45, 'Lâmina e ponta de bombeiro. Duas mãos; +5 em FOR para arrombar portas.', { slot: 'duas_maos', durability: { pv: 16, rd: 7 } }),
  item('arma', 'Taser', '1d4', 80, 'Dispara dois dardos elétricos (alcance curto). O alvo faz CON(14) ou fica atordoado por uma rodada. Um tiro por cartucho.', { durability: { pv: 5, rd: 2 } }),
  item('arma', 'Arco composto', '1d8', 150, 'Roldanas e fibra de carbono. Duas mãos; alcance longo. Silencioso.', { slot: 'duas_maos', durability: { pv: 8, rd: 3 } }),
  ...pick('Pistola 9 mm', 'Escopeta calibre 12', 'Escopeta de cano serrado', 'Submetralhadora', 'Fuzil de assalto'),
  item('arma', 'Fuzil de precisão', '2d10', 1500, 'Duas mãos; alcance extremo. Ferrolho, luneta e bipé: parado e mirando por uma ação, +2 no ataque.', { slot: 'duas_maos', durability: { pv: 12, rd: 6 } }),
  // Munição
  ...pick('Balas 9 mm', 'Cartuchos calibre 12', 'Munição de fuzil'),
  item('municao', 'Munição .308', '', 40, 'Caixa com 20 balas de precisão.', { pack: 20 }),
  item('municao', 'Cartuchos de taser', '', 25, 'Cinco cartuchos de dardos.', { pack: 5 }),
  item('municao', 'Flechas de carbono', '', 30, 'Doze flechas de ponta de caça para arco composto.', { pack: 12 }),
  // Proteção
  ...pick('Jaqueta de couro grosso'),
  item('protecao', 'Jaqueta de motociclista', '', 60, 'Couro com proteções nos ombros e cotovelos.', { effects: { rdPhysical: 1 }, durability: { pv: 14, rd: 3 } }),
  ...pick('Colete balístico', 'Colete tático com placas', 'Escudo balístico'),
  // Ferramentas e equipamentos
  ...pick('Lanterna tática', 'Lanterna de cabeça', 'Bastões de luz química', 'Sinalizador'),
  item('equipamento', 'Smartphone', '', 300, 'Câmera, GPS e internet, quando há sinal. A bateria dura um dia.', { slot: 'uma_mao', durability: { pv: 2, rd: 0 } }),
  item('equipamento', 'Notebook', '', 800, '+5 em INT para pesquisar, quebrar senhas fracas e cruzar dados.', { slot: 'duas_maos', durability: { pv: 3, rd: 0 } }),
  item('equipamento', 'Kit de invasão eletrônica', '', 250, 'Clonador de cartões, cabos e um pendrive com ferramentas. +5 em INT contra fechaduras eletrônicas e alarmes.', { slot: 'uma_mao' }),
  item('equipamento', 'Drone com câmera', '', 600, 'Voa por 25 minutos, até 1 km de quem pilota. Zumbido audível a 20 m.', { durability: { pv: 3, rd: 1 } }),
  item('equipamento', 'Câmera térmica', '', 700, 'Vê calor através de fumaça e escuridão. E pontos frios onde não deveria haver.', { slot: 'uma_mao', durability: { pv: 3, rd: 1 } }),
  item('equipamento', 'Detector de campo eletromagnético', '', 60, 'Os LEDs acendem perto de fiação, de aparelhos e de presenças.', { slot: 'uma_mao', durability: { pv: 2, rd: 0 } }),
  ...pick('Óculos de visão noturna', 'Rádio comunicador (par)', 'Máscara de gás', 'Kit forense', 'Câmera fotográfica', 'Gravador de áudio', 'Corda (15 m)', 'Mochila'),
  item('equipamento', 'Abraçadeiras plásticas', '', 2, 'Dez lacres de náilon que servem de algema. FOR(18) para arrebentar.', { pack: 10 }),
  item('equipamento', 'Carregador portátil', '', 40, 'Recarrega um celular duas vezes ou o rádio uma vez.'),
  // Consumíveis
  ...pick('Kit de primeiros socorros', 'Bandagens', 'Seringa de adrenalina', 'Coquetel molotov', 'Granada de fragmentação'),
  item('consumivel', 'Torniquete', '', 8, 'Uma ação, até em si mesmo: encerra Sangrando.'),
  item('consumivel', 'Spray de pimenta', '', 10, 'Cone curto. O alvo faz CON(13) ou fica cego por uma rodada. Cinco jatos.', { pack: 5 }),
];

// ── Ocultismo ────────────────────────────────────────────────────────────────

const OCULTISMO: ItemData[] = [
  // Armas e catalisadores
  item('arma', 'Estaca de freixo', '1d6', 4, 'Ponta endurecida no fogo. Cravada no peito de quem não deveria estar vivo, faz mais do que ferir.', { durability: { pv: 4, rd: 1 } }),
  ...pick('Crucifixo de prata', 'Rosário', 'Livro de orações', 'Relicário'),
  ...pick('Grimório encadernado em couro', 'Ídolo de osso', 'Adaga ritual'),
  ...pick('Pêndulo de cristal', 'Baralho de tarô', 'Espelho negro'),
  // Proteção e munição
  ...pick('Hábito consagrado', 'Manto de runas', 'Balas de prata'),
  // Ferramentas e equipamentos
  ...pick('Castiçal com vela', 'Velas', 'Gravador de áudio', 'Câmera fotográfica'),
  item('equipamento', 'Giz e carvão ritual', '', 3, 'Para traçar círculos e selos. Um círculo bem fechado (INT(15)) segura entidades menores do lado de fora.', { durability: { pv: 1, rd: 0 } }),
  item('equipamento', 'Incensário', '', 20, 'Mirra e olíbano numa corrente de latão. A fumaça revela por um instante o contorno do que é invisível.', { slot: 'uma_mao', durability: { pv: 5, rd: 3 } }),
  // Consumíveis
  ...pick('Água benta', 'Sal grosso (saco)'),
  item('consumivel', 'Óleo de unção', '', 30, 'Frasco consagrado. Uma ação para ungir uma arma: por um combate, ela causa +1d4 de dano sagrado.', { pack: 3 }),
];

export const ITEM_SETS: ItemSet[] = [
  { id: 'iluminacao', name: 'Iluminação', description: 'Tochas, lampiões, lanternas, velas e sinalizadores, cada um com seu alcance de luz no mapa.', items: LIGHT_ITEMS },
  { id: 'medieval', name: 'Medieval', description: 'Espadas, arcos e armaduras, ferramentas de estrada e de masmorra, ervas e venenos.', items: MEDIEVAL },
  { id: 'old_school', name: 'Old School', description: 'Anos 1920 a 1950: revólveres, Thompson e dinamite, câmera de fole, lupa e kit de digitais.', items: OLD_SCHOOL },
  { id: 'contemporaneo', name: 'Contemporâneo', description: 'Pistolas, fuzis e taser, coletes, drones, câmera térmica e kit de invasão eletrônica.', items: CONTEMPORANEO },
  { id: 'ocultismo', name: 'Ocultismo', description: 'Catalisadores sagrados, profanos e etéreos, água benta, sal, balas de prata e o que se usa num ritual.', items: OCULTISMO },
];

export interface SetGap {
  /** Itens que a biblioteca não tem (pelo nome). */
  add: ItemData[];
  /** Itens de mesmo nome que ainda não iluminam (bibliotecas de antes da iluminação). */
  update: Array<{ id: string; item: ItemData }>;
}

/** O que falta na biblioteca para ter estes itens. Nomes repetidos entram uma vez só. */
export function missingSetItems(library: Record<string, LibraryItem>, items: ItemData[]): SetGap {
  const byName = new Map(Object.values(library).map((it) => [nameKey(it.name), it]));
  const seen = new Set<string>();
  const gap: SetGap = { add: [], update: [] };
  for (const it of items) {
    const key = nameKey(it.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const have = byName.get(key);
    if (!have) gap.add.push(it);
    else if (it.effects.light && !have.effects?.light) {
      const { id, createdAt: _c, updatedAt: _u, ...data } = have;
      gap.update.push({ id, item: { ...data, effects: { ...data.effects, light: it.effects.light } } });
    }
  }
  return gap;
}

/** Mesmo item do conjunto, campo a campo (o motor guarda luz 0 como ausente). */
function sameItem(a: ItemData, b: ItemData): boolean {
  return a.name.trim() === b.name.trim() && a.type === b.type && a.slot === b.slot && a.description === b.description
    && a.damage === b.damage && a.value === b.value && a.pack === b.pack
    && a.effects.def === b.effects.def && a.effects.rdPhysical === b.effects.rdPhysical && a.effects.rdMagic === b.effects.rdMagic
    && (a.effects.light ?? 0) === (b.effects.light ?? 0)
    && a.durability.pv === b.durability.pv && a.durability.rd === b.durability.rd && a.durability.def === b.durability.def;
}

export type { SetRemoval };

/** Itens do conjunto que estão na biblioteca (pelo nome), para desimportar. */
export function installedSetItems(library: Record<string, LibraryItem>, setId: ItemSetId): SetRemoval[] {
  return installedInSet(library, ITEM_SETS, setId, sameItem);
}
