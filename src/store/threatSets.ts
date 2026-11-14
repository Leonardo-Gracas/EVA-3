// Conjuntos de ameaças para importar no painel do mestre (modal "Conjuntos de ameaças"),
// por classe: Ocultistas, Criminosos e Selvagens. Importar só traz o que o painel
// ainda não tem, pelo nome. Tudo entra pelo motor (threat/upsert).
//
// Força, pensada para um grupo de 3–4 personagens de nível 1: Fraco (em bando),
// Comum (um por personagem), Forte (um para o grupo), Elite (luta difícil) e
// Chefe (encerra um arco). A força abre a descrição, para buscar por "Elite"... no painel.
import type { Threat, ThreatAbility, ThreatAttack, ThreatCategory, ThreatData } from '../model/types';
import { DEFAULT_MOVEMENT } from '../model/types';
import type { Attributes } from '../rules/attributes';
import { installedInSet, nameKey, type CatalogSet, type SetRemoval } from './catalogSets';

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
    name, concept: `${tier} · ${concept}`, category: 'humano', attributes,
    pvMax: stats.pv, peMax: stats.pe ?? 0, def: stats.def, von: stats.von ?? 10 + attributes.FE,
    rdPhysical: stats.rd ?? 0, rdMagic: stats.rdm ?? 0, movement: DEFAULT_MOVEMENT,
    attacks, abilities, notes,
  };
}

/** Outra categoria (e deslocamento, em metros) para uma ameaça. */
const as = (category: ThreatCategory, t: ThreatData, movement = t.movement): ThreatData => ({ ...t, category, movement });

const INCORPOREO = hab('Incorpóreo', '', 'Atravessa paredes e flutua. Armas comuns causam metade do dano; sal, prata, fogo e dano sagrado causam o dano inteiro.');
const ENXAME = hab('Enxame', '', 'Ocupa o quadrado inteiro. Dano em área causa o dobro; corte e perfuração causam metade.');
const MATILHA = hab('Matilha', '', '+2 no ataque se outro da matilha estiver adjacente ao alvo.');

// ── Ocultistas: cultos, caçadores do oculto, fantasmas e demônios ────────────

const OCULTISTAS: ThreatData[] = [
  // Cultos e caçadores
  threat('Fraco', 'Cultista iniciado', 'Túnica nova, fé cega, faca ritual.', { FE: 1, INT: -1 },
    { pv: 6, pe: 2, def: 10 }, [atk('Faca ritual', 1, '1d4')],
    [hab('Cântico', '1 PE', 'Ação de movimentação: um aliado cultista em alcance curto recebe +2 no próximo ataque.')]),
  threat('Comum', 'Cultista devoto', 'Já viu o que o culto promete e quer mais.', { FE: 2, INT: 1, PRE: 1 },
    { pv: 10, pe: 6, def: 11, rdm: 1 }, [atk('Adaga ritual', 2, '1d4+1')],
    [hab('Praga menor', '2 PE', 'Alvo em alcance curto: 2d6 de dano profano. FÉ(15) reduz à metade.')]),
  threat('Forte', 'Sacerdote do culto', 'Prega sobre o fim do mundo e acredita nele.', { FE: 3, INT: 2, PRE: 2 },
    { pv: 16, pe: 15, def: 11, rdm: 3 }, [atk('Adaga ritual', 2, '1d4+1')],
    [hab('Praga', '5 PE e 2 PV', 'Alvo em alcance médio: 4d6 de dano profano. FÉ(20) reduz à metade.'),
      hab('Fervor', '3 PE', 'Todos os cultistas em alcance curto recebem +2 nos ataques por 2 rodadas.'),
      hab('Escudo de fiéis', '', 'Um cultista adjacente pode receber o ataque no lugar dele.')]),
  threat('Elite', 'Ocultista renegado', 'Aprendeu demais, rápido demais, com quem não devia.', { INT: 4, FE: 1, PRE: 2, CON: 1 },
    { pv: 26, pe: 24, def: 12, rd: 1, rdm: 4 }, [atk('Toque de chamas', 6, '2d6', 'Alcance de toque.')],
    [hab('Explosão de chamas', '3 PE', 'Alcance curto: 3d6 de fogo em um alvo.'),
      hab('Alterar temperatura', '5 PE', 'Alcance médio: 6 + 1d6 de fogo ou frio. FÉ(20) reduz à metade.'),
      hab('Escudo arcano', '2 PE', 'Reação: +4 de DEF contra um ataque.')]),
  threat('Elite', 'Inquisidor renegado', 'Acólito que decidiu que todo mundo é herege.', { FOR: 2, CON: 3, FE: 4, PRE: 2 },
    { pv: 36, pe: 18, def: 13, rd: 4, rdm: 5 }, [atk('Martelo de guerra consagrado', 6, '1d8+4', '+1d6 sagrado contra quem usa magia profana.'), atk('Escopeta calibre 12', 4, '3d6')],
    [hab('Repreender', '2 PE', 'Teste de FÉ contra a VON do alvo: 2d6 de dano sagrado, crítico 18.'),
      hab('Juízo', '5 PE', 'Alvo em alcance curto faz FÉ(20) ou fica imóvel por 1 rodada.'),
      hab('Inabalável', '', 'Não fica inconsciente com 0 PV; continua lutando até o limite de morte.')]),
  threat('Elite', 'Assassina da Ordem', 'Treinada desde a infância para matar o que caça.', { DES: 4, INT: 2, PRE: 3, FE: 2 },
    { pv: 30, pe: 10, def: 17, rd: 2, rdm: 2 }, [atk('Lâminas gêmeas', 7, '1d6+3', 'Ataca duas vezes por turno.'), atk('Facas de arremesso', 6, '1d4+3', 'Alcance curto.')],
    [hab('Sombra', '2 PE', 'Fica invisível até o próximo ataque. O primeiro ataque vindo da sombra é crítico com 17+.'),
      hab('Reflexos', '', 'Uma vez por rodada, reduz à metade o dano de um ataque que a atingiu.')]),
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

  // Fantasmas
  as('etereo', threat('Fraco', 'Lamento', 'Fantasma. Eco de uma morte que se repete toda noite, na mesma hora.', { PRE: 1, FE: 1 },
    { pv: 6, pe: 4, def: 10 }, [atk('Toque gelado', 2, '1d4', 'Frio; ignora RD física.')],
    [INCORPOREO, hab('Reviver a morte', '2 PE', 'Quem vê a cena faz FÉ(13) ou recebe −2 no próximo teste.')],
    'Some quando a cena termina. Descobrir como morreu e dar fim ao corpo encerra o lamento.')),
  as('etereo', threat('Comum', 'Poltergeist', 'Fantasma. Raiva sem corpo que arremessa o que estiver à mão.', { INT: 1, PRE: 2, FE: 1 },
    { pv: 12, pe: 10, def: 12 }, [atk('Objeto arremessado', 3, '1d6+1', 'Alcance médio.')],
    [INCORPOREO, hab('Tempestade de objetos', '3 PE', 'Todos em raio de 5 m: 2d6. DES(14) reduz à metade.'),
      hab('Invisível', '', 'Só aparece no instante em que ataca.')])),
  as('etereo', threat('Forte', 'Assombração', 'Fantasma. Preso à casa onde morreu, e a casa obedece a ele.', { FE: 2, PRE: 3, INT: 2 },
    { pv: 22, pe: 18, def: 12, rdm: 3 }, [atk('Mãos frias', 5, '1d8+2', 'Frio; ignora RD física.')],
    [INCORPOREO, hab('Casa viva', '3 PE', 'Num cômodo: portas batem e trancam, luzes apagam e a temperatura despenca até o fim da cena.'),
      hab('Possuir', '5 PE', 'Alvo em alcance curto faz FÉ(17) ou age sob o controle dele por 1 rodada.'),
      hab('Preso ao lugar', '', 'Não sai da casa. Destruir o vínculo (ossos, um objeto querido) o desfaz.')])),
  as('etereo', threat('Elite', 'Espectro vingativo', 'Fantasma. Morreu traído e lembra de cada rosto.', { FE: 3, PRE: 4, DES: 2 },
    { pv: 34, pe: 24, def: 15, rdm: 5 }, [atk('Garras de névoa', 7, '2d6+2', 'Frio; ignora RD física.')],
    [INCORPOREO, hab('Grito do túmulo', '4 PE', 'Cone de 6 m: 3d6. FÉ(18) reduz à metade; quem falha perde a próxima ação de movimentação.'),
      hab('Vingança', '', '+2 no ataque e no dano contra quem o feriu na última rodada.'),
      hab('Volta', '', 'Se não for exorcizado, reaparece na noite seguinte com metade do PV.')])),

  // Demônios encarnados: têm corpo próprio, vindo do outro lado.
  as('demoniaco', threat('Fraco', 'Diabrete', 'Demônio encarnado. Do tamanho de um gato, dentes demais e risada de criança.', { DES: 2, INT: 1, FOR: -1 },
    { pv: 7, pe: 4, def: 13, rdm: 2 }, [atk('Mordida', 3, '1d4+1')],
    [hab('Voo', '', 'Voa.'), hab('Sumir em fumaça', '2 PE', 'Some e reaparece a até 9 m.')],
    'Em bando de três a seis. Foge quando o invocador cai.'), 12),
  as('demoniaco', threat('Comum', 'Cão infernal', 'Demônio encarnado. Couro preto em brasa e olhos de carvão.', { FOR: 2, DES: 2, CON: 2 },
    { pv: 16, pe: 6, def: 12, rd: 1, rdm: 2 }, [atk('Mordida em brasa', 4, '1d8+2', '+1d4 de fogo.')],
    [hab('Hálito de brasa', '3 PE', 'Cone de 4,5 m: 2d6 de fogo. DES(14) reduz à metade.'),
      hab('Faro do medo', '', '+2 no ataque contra quem está com menos da metade do PV.')]), 15),
  as('demoniaco', threat('Forte', 'Demônio de carne', 'Demônio encarnado. Uma massa de músculo costurada de corpos alheios.', { FOR: 4, CON: 4, DES: -1, INT: -1 },
    { pv: 34, pe: 8, def: 10, rd: 3, rdm: 3 }, [atk('Punho de osso', 6, '1d10+4'), atk('Esmagar', 5, '1d6+4', 'Acerto: o alvo fica agarrado (FOR(17) para escapar).')],
    [hab('Regeneração', '', 'Recupera 3 PV no começo do turno, a não ser que tenha sofrido dano sagrado ou de fogo na rodada.'),
      hab('Fome', '', 'Ao derrubar alguém, recupera 2d6 PV.')])),
  as('demoniaco', threat('Chefe', 'Senhor do abismo', 'Demônio encarnado. Um nome antigo que alguém foi tolo de pronunciar.', { FOR: 5, CON: 5, FE: 4, INT: 4, PRE: 5 },
    { pv: 80, pe: 40, def: 16, von: 20, rd: 5, rdm: 7 }, [atk('Lâmina de obsidiana', 9, '2d8+5'), atk('Chicote de fogo', 8, '2d6+3', 'Alcance de 6 m; puxa o alvo 3 m para perto.')],
    [hab('Duas ações', '', 'Age duas vezes por rodada, em iniciativas diferentes.'),
      hab('Aura de pavor', '', 'Quem começa o turno a até 6 m faz FÉ(20) ou recebe −2 nos ataques contra ele.'),
      hab('Chamar a corte', '8 PE', 'Surgem 1d4 diabretes em alcance curto.'),
      hab('Pacto', '', 'Oferece a um personagem o que ele mais quer, em troca de parar de lutar.')],
    'A 0 PV não morre: volta ao abismo. Só um ritual o prende ou o destrói.')),

  // Demônios possessores: sem corpo, moram em alguém.
  as('demoniaco', threat('Comum', 'Possuído', 'Demônio possessor. Alguém comum, com algo olhando de dentro.', { FOR: 2, CON: 2, FE: 1 },
    { pv: 14, pe: 6, def: 11, rdm: 2 }, [atk('Golpes sem medida', 4, '1d6+2', 'Não sente dor: ignora penalidades por ferimento.')],
    [hab('Voz que não é dele', '2 PE', 'Diz em voz alta um segredo de um personagem; o alvo faz FÉ(14) ou recebe −2 no próximo teste.'),
      hab('Hospedeiro', '', 'O dano é no corpo da pessoa. Exorcizar (Repreender ou ritual) expulsa o demônio sem matá-la.')],
    'A 0 PV, o hospedeiro cai e o demônio procura outro corpo a até 9 m.')),
  as('demoniaco', threat('Elite', 'Possessor', 'Demônio possessor. A coisa em si: pula de corpo em corpo e não tem pressa.', { FE: 4, INT: 4, PRE: 4 },
    { pv: 30, pe: 30, def: 14, von: 18, rdm: 6 }, [atk('Garras do hospedeiro', 6, '1d8+3'), atk('Toque de corrupção', 7, '2d8', 'Dano profano.')],
    [hab('Trocar de corpo', '5 PE', 'Reação ao chegar a 0 PV: possui alguém a até 9 m que falhe em FÉ(18) e volta com 20 PV. Sem ninguém por perto, foge como névoa.'),
      hab('Sussurro', '3 PE', 'Alvo em alcance médio faz FÉ(18) ou ataca um aliado no próximo turno.'),
      hab('Expulso, não morto', '', 'Só um exorcismo ou um selo o prende de vez.')])),
];

// ── Criminosos: do arruaceiro ao chefão ──────────────────────────────────────

const CRIMINOSOS: ThreatData[] = [
  threat('Fraco', 'Arruaceiro', 'Briga de rua com coragem emprestada do grupo.', { FOR: 1, DES: 0, CON: 0, INT: -1 },
    { pv: 6, def: 10 }, [atk('Soco', 1, '1d3'), atk('Faca', 1, '1d4')], [],
    'Foge quando metade do bando cai.'),
  threat('Fraco', 'Viciado desesperado', 'Faz qualquer coisa pela próxima dose.', { DES: 1, CON: -1, FE: -1 },
    { pv: 5, def: 11 }, [atk('Caco de vidro', 1, '1d4')],
    [hab('Sem nada a perder', '', 'Não faz testes de moral. Ao chegar a 0 PV, faz um último ataque antes de cair.')]),
  threat('Fraco', 'Capanga novato', 'Contratado ontem, ainda acha que é emprego fácil.', { FOR: 1, CON: 1 },
    { pv: 8, def: 11 }, [atk('Taco de beisebol', 2, '1d6'), atk('Revólver .38', 1, '2d6', 'Erra muito: falha crítica com 1 ou 2.')]),
  threat('Comum', 'Capanga armado', 'Pistola na cintura, ordens claras.', { FOR: 1, DES: 2, CON: 1 },
    { pv: 12, def: 12 }, [atk('Pistola 9 mm', 3, '2d6'), atk('Coronhada', 2, '1d4+1')], [],
    'Procura cobertura antes de atirar.'),
  threat('Comum', 'Segurança particular', 'Terno, ponto no ouvido e colete por baixo.', { FOR: 2, CON: 2, DES: 1 },
    { pv: 14, def: 11, rd: 2 }, [atk('Cassetete', 3, '1d6+1'), atk('Pistola 9 mm', 2, '2d6')],
    [hab('Chamar reforços', '', 'Ação: pelo rádio, chega 1 segurança a cada 2 rodadas até o alarme ser cortado.')]),
  threat('Comum', 'Policial', 'Treinado, armado e com a lei do lado dele.', { FOR: 1, DES: 2, CON: 1, INT: 1 },
    { pv: 14, def: 12, rd: 2 }, [atk('Pistola 9 mm', 4, '2d6'), atk('Cassetete', 2, '1d6')],
    [hab('Voz de prisão', '', 'Ação de movimentação: alvo em alcance curto faz PRE(15) ou perde a próxima ação de movimentação.')]),
  threat('Comum', 'Cobrador', 'Brutamontes. Quebra dedos de quem atrasa o pagamento.', { FOR: 3, CON: 2, INT: -1 },
    { pv: 18, def: 10, rd: 1 }, [atk('Soco-inglês', 4, '1d4+3'), atk('Taco com pregos', 4, '1d6+3')],
    [hab('Intimidar', '', 'Ação de movimentação: alvo em alcance curto faz PRE(14) ou recebe −2 nos ataques contra ele por 1 rodada.')]),
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
  threat('Elite', 'Gorila do chefão', 'Brutamontes. Dois metros, vinte anos de guarda-costas, nunca deixou o chefe levar um tiro.', { FOR: 5, CON: 5, DES: 1 },
    { pv: 48, def: 12, rd: 4 }, [atk('Punhos', 7, '1d8+5'), atk('Escopeta de cano serrado', 5, '3d6', 'Cone: atinge até dois alvos adjacentes.')],
    [hab('Guarda-costas', '', 'Reação: recebe um ataque que acertaria um aliado adjacente.'),
      hab('Inabalável', '', 'Não pode ser derrubado nem agarrado.'),
      hab('Fúria', '', 'Com metade do PV ou menos, +2 no dano.')]),
  threat('Elite', 'Comandante mercenário', 'Planeja a luta antes de ela começar.', { FOR: 2, DES: 3, CON: 3, INT: 3 },
    { pv: 40, pe: 6, def: 15, rd: 5 }, [atk('Fuzil de assalto', 7, '2d8+2', 'Rajada: +1d8 de dano.'), atk('Faca de combate', 6, '1d6+2')],
    [hab('Ordens', '2 PE', 'Ação de movimentação: até dois aliados podem mover ou atacar imediatamente.'),
      hab('Tática', '', 'Recebe +2 de DEF enquanto houver um aliado adjacente.')]),
  threat('Elite', 'Chefona do contrabando', 'Chefe mafiosa. Controla o porto e tudo o que entra e sai dele.', { INT: 4, PRE: 3, DES: 2 },
    { pv: 34, pe: 10, def: 14, rd: 3 }, [atk('Pistola .45 dourada', 6, '2d6+2'), atk('Navalha', 5, '1d4+3')],
    [hab('Rede de favores', '3 PE', 'Chama 1d4 capangas armados, que chegam em 2 rodadas.'),
      hab('Sempre uma saída', '', 'Uma vez por combate, some por uma passagem preparada.'),
      hab('Olho clínico', '', 'Sabe o que cada personagem quer, e oferece.')]),
  threat('Chefe', 'Chefão do crime', 'Dono do bairro. Nunca suja as mãos se puder evitar.', { FOR: 1, DES: 2, CON: 2, INT: 3, PRE: 4 },
    { pv: 45, pe: 10, def: 14, rd: 4 }, [atk('Revólver banhado a ouro', 6, '2d6+3'), atk('Bengala com lâmina', 5, '1d8+2')],
    [hab('Sempre acompanhado', '', 'Entra em combate com 2 capangas armados e 1 brutamontes.'),
      hab('Escudo humano', '', 'Reação: um capanga adjacente recebe o ataque no lugar dele.'),
      hab('Proposta', '3 PE', 'Alvo em alcance curto faz INT(18) ou para de atacá-lo por 1 rodada para ouvir.')],
    'Prefere negociar, subornar ou fugir a morrer. Tem informação valiosa.'),
  threat('Chefe', 'Don da família', 'Chefão mafioso. Velho, educado, e nunca esquece uma ofensa.', { INT: 4, PRE: 5, CON: 1 },
    { pv: 50, pe: 15, def: 13, von: 16, rd: 3 }, [atk('Bengala-espada', 5, '1d6+3'), atk('Revólver .38 de estimação', 6, '2d6+2')],
    [hab('Sempre acompanhado', '', 'Entra em combate com o gorila do chefão e 2 capangas armados.'),
      hab('A família protege', '', 'Com um aliado a até 9 m, ataques à distância contra ele recebem −2.'),
      hab('Ordem final', '5 PE', 'Todos os aliados que o veem atacam imediatamente.'),
      hab('Oferta irrecusável', '3 PE', 'Alvo em alcance curto faz INT(19) ou não ataca o Don nesta rodada.')],
    'Morto, a família inteira vem cobrar a dívida.'),
];

// ── Selvagens: animais e quem caça na mata ───────────────────────────────────

const SELVAGENS: ThreatData[] = [
  as('animal', threat('Fraco', 'Enxame de ratos', 'Animal. Centenas de ratos famintos saindo das paredes.', { DES: 2, CON: -1, FOR: -2 },
    { pv: 8, def: 10 }, [atk('Mordidas', 3, '1d4', 'Atinge todos no quadrado do enxame.')], [ENXAME])),
  as('animal', threat('Fraco', 'Cobra venenosa', 'Animal. Jararaca enrolada onde ninguém olha.', { DES: 3, CON: -1 },
    { pv: 4, def: 13 }, [atk('Picada', 4, '1d3', 'CON(14) ou fica Envenenado: 1d4 por rodada, por 3 rodadas.')],
    [hab('Escondida', '', 'Na mata ou no escuro, só é vista com INT(15).')]), 6),
  as('animal', threat('Fraco', 'Cão selvagem', 'Animal. Magro, sarnento e nunca sozinho.', { DES: 2, FOR: 1 },
    { pv: 7, def: 11 }, [atk('Mordida', 3, '1d6')], [MATILHA]), 15),
  as('animal', threat('Comum', 'Lobo', 'Animal. Caça em silêncio e cerca a presa.', { DES: 2, FOR: 2, CON: 1 },
    { pv: 13, def: 12 }, [atk('Mordida', 4, '1d6+2', 'Acerto: o alvo faz FOR(13) ou cai no chão.')], [MATILHA]), 15),
  as('animal', threat('Comum', 'Javali', 'Animal. Presas de faca e nenhum senso de perigo.', { FOR: 3, CON: 3, INT: -2 },
    { pv: 16, def: 11, rd: 1 }, [atk('Presas', 4, '1d8+2')],
    [hab('Investida', '', 'Movendo ao menos 6 m em linha reta antes de atacar: +1d6 de dano.'),
      hab('Teimoso', '', 'Ao chegar a 0 PV, ataca mais uma vez antes de cair.')]), 12),
  as('animal', threat('Comum', 'Enxame de morcegos', 'Animal. Uma nuvem de asas que apaga a lanterna.', { DES: 3, FOR: -2 },
    { pv: 10, def: 14 }, [atk('Mordidas', 3, '1d4', 'Atinge todos no quadrado do enxame.')],
    [hab('Voo', '', 'Voa.'), ENXAME, hab('Nuvem', '', 'Quem está no quadrado do enxame recebe −2 nos ataques e não enxerga além dele.')]), 18),
  threat('Comum', 'Caçador', 'Conhece a mata melhor que a própria casa.', { DES: 2, CON: 1, PRE: 2 },
    { pv: 12, def: 12 }, [atk('Rifle de caça', 4, '2d8', 'Alcance longo; um tiro por turno.'), atk('Facão', 2, '1d6+1')],
    [hab('Rastreador', '', 'Sempre sabe onde estão os personagens a até 50 m, mesmo escondidos.')]),
  as('animal', threat('Forte', 'Jacaré', 'Animal. Um tronco imóvel na margem, até não ser.', { FOR: 4, CON: 3 },
    { pv: 26, def: 12, rd: 3 }, [atk('Mordida', 6, '1d10+3', 'Acerto: o alvo fica agarrado (FOR(16) para escapar).')],
    [hab('Giro da morte', '', 'No começo do turno do jacaré, o alvo agarrado sofre 2d6.'),
      hab('Emboscada na água', '', '+4 no ataque contra quem não o viu. Na água, desloca 12 m.')]), 6),
  as('animal', threat('Forte', 'Onça-pintada', 'Animal. Não se ouve chegar.', { DES: 4, FOR: 3, CON: 2 },
    { pv: 24, def: 15 }, [atk('Garras', 6, '1d6+3', 'Ataca duas vezes por turno.'), atk('Mordida na nuca', 6, '1d10+3', 'Só contra alvo caído ou agarrado; ignora RD.')],
    [hab('Bote', '', 'Saltando de um esconderijo, o primeiro ataque derruba o alvo.'),
      hab('Furtiva', '', 'Na mata, só é vista com INT(17).')]), 15),
  as('animal', threat('Elite', 'Urso pardo', 'Animal. Meia tonelada defendendo o território.', { FOR: 6, CON: 5 },
    { pv: 50, def: 12, rd: 3 }, [atk('Patada', 8, '2d6+5'), atk('Abraço', 7, '1d8+5', 'Acerto: o alvo fica agarrado (FOR(19)) e sofre 2d6 no turno seguinte.')],
    [hab('Fúria', '', 'Com metade do PV ou menos, ataca duas vezes por turno.')]), 12),
  as('animal', threat('Elite', 'Lobo alfa', 'Animal. Maior que os outros, cicatrizes de todas as brigas que venceu.', { DES: 3, FOR: 3, CON: 3, PRE: 2 },
    { pv: 36, def: 14, rd: 1 }, [atk('Mordida', 7, '1d10+3', 'Acerto: o alvo faz FOR(16) ou cai no chão.')],
    [hab('Uivo', '', 'Ação de movimentação: todos os lobos que ouvem agem logo em seguida.'),
      hab('Sempre em matilha', '', 'Chega com 2d4 lobos.'), hab('Instinto', '', 'Não pode ser surpreendido.')]), 15),
  as('animal', threat('Chefe', 'A Fera da mata', 'Animal. Grande demais para qualquer espécie conhecida; a vila tem um nome para ela.', { FOR: 6, DES: 4, CON: 6, INT: 1, PRE: 4 },
    { pv: 75, def: 15, rd: 4, rdm: 2 }, [atk('Garras', 9, '2d8+5'), atk('Mordida', 8, '2d10+4')],
    [hab('Duas ações', '', 'Age duas vezes por rodada, em iniciativas diferentes.'),
      hab('Território', '', 'Na mata, uma vez por rodada some e reaparece a até 30 m (ação de movimentação).'),
      hab('Rugido', '', 'Uma vez por combate: todos a até 18 m fazem FÉ(18) ou perdem a próxima ação.'),
      hab('Cicatrizes antigas', '', 'Ignora o primeiro acerto crítico do combate.')],
    'Ferida, foge para a mata e volta na noite seguinte com o PV inteiro.'), 15),
];

export type ThreatSetId = 'ocultistas' | 'criminosos' | 'selvagens';

export interface ThreatSet extends CatalogSet<ThreatData> {
  id: ThreatSetId;
}

export const THREAT_SETS: ThreatSet[] = [
  { id: 'ocultistas', name: 'Ocultistas', description: 'Cultos e caçadores do oculto, fantasmas e dois tipos de demônio: encarnados e possessores.', items: OCULTISTAS },
  { id: 'criminosos', name: 'Criminosos', description: 'Arruaceiros, capangas, brutamontes, matadores e os chefões mafiosos que mandam neles.', items: CRIMINOSOS },
  { id: 'selvagens', name: 'Selvagens', description: 'Animais selvagens, de enxames de ratos à fera que a vila teme, e o caçador da mata.', items: SELVAGENS },
];

/** Ameaças destes conjuntos que o painel não tem (pelo nome). Nomes repetidos entram uma vez só. */
export function missingThreats(threats: Record<string, Threat>, items: ThreatData[]): ThreatData[] {
  const have = new Set(Object.values(threats).map((t) => nameKey(t.name)));
  const seen = new Set<string>();
  return items.filter((t) => {
    const key = nameKey(t.name);
    if (have.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const sameList = <T,>(a: T[], b: T[], fields: Array<keyof T>) =>
  a.length === b.length && a.every((x, i) => fields.every((f) => x[f] === b[i][f]));

/** Mesma ameaça do conjunto, campo a campo (sem os ids que o motor dá a ataques e habilidades). */
function sameThreat(a: ThreatData, b: ThreatData): boolean {
  return a.name.trim() === b.name.trim() && a.concept === b.concept && a.category === b.category && a.notes === b.notes
    && (Object.keys(b.attributes) as Array<keyof Attributes>).every((k) => a.attributes[k] === b.attributes[k])
    && a.pvMax === b.pvMax && a.peMax === b.peMax && a.def === b.def && a.von === b.von
    && a.rdPhysical === b.rdPhysical && a.rdMagic === b.rdMagic && a.movement === b.movement
    && sameList(a.attacks, b.attacks, ['name', 'bonus', 'damage', 'notes'])
    && sameList(a.abilities, b.abilities, ['name', 'cost', 'text']);
}

export type { SetRemoval };

/** Ameaças do conjunto que estão no painel (pelo nome), para desimportar. */
export function installedThreatSet(threats: Record<string, Threat>, setId: ThreatSetId): SetRemoval[] {
  return installedInSet(threats, THREAT_SETS, setId, sameThreat);
}
