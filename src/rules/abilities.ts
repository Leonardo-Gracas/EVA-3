// Habilidades de classe do EVA 3. Estáticas: só mudam por código.
//
// `minClassLevel` é o nível NA CLASSE exigido (o "REQUISITO: N° NÍVEL" do livro).
// `effect` descreve bônus passivos aplicados automaticamente na ficha.
// `peCost`/`pvCost` são o custo base de uso; a tela de uso deixa ajustar o valor
// para os gastos extras ("pode gastar mais 1 PE para...").
import type { AttrKey } from './attributes';
import type { ClassId } from './classes';

export interface Scaled {
  base: number;
  attr?: AttrKey;
}

export interface AbilityEffect {
  pvMax?: Scaled;
  peMax?: Scaled;
  def?: Scaled;
  /** Redução de dano contra dano mágico. */
  rdMagic?: number;
  /** Redução de dano contra dano físico. */
  rdPhysical?: number;
  /** PV 0 não deixa inconsciente. */
  noUnconscious?: boolean;
  /** Soma o atributo no dano final (apenas informativo na ficha). */
  damageAttr?: AttrKey;
}

export interface AbilityRequirement {
  attr?: { key: AttrKey; min: number };
  ability?: string;
}

export interface Ability {
  id: string;
  classId: ClassId;
  name: string;
  minClassLevel: number;
  passive: boolean;
  peCost?: number;
  pvCost?: number;
  /** Texto curto do custo, quando o custo não é um número simples. */
  costNote?: string;
  text: string;
  requires?: AbilityRequirement;
  effect?: AbilityEffect;
}

const A: Ability[] = [
  // ── ACÓLITO ────────────────────────────────────────────────────────────────
  {
    id: 'fortificado', classId: 'acolito', name: 'Fortificado', minClassLevel: 1, passive: true,
    text: '2 + FÉ de PV.',
    effect: { pvMax: { base: 2, attr: 'FE' } },
  },
  {
    id: 'clareza', classId: 'acolito', name: 'Clareza', minClassLevel: 1, passive: true,
    text: '2 + FÉ de PE.',
    effect: { peMax: { base: 2, attr: 'FE' } },
  },
  {
    id: 'devocao', classId: 'acolito', name: 'Devoção', minClassLevel: 1, passive: false, peCost: 1,
    text: 'Gaste 1 de PE para receber 2 pontos em qualquer teste individual. O limite de uso é o nível da classe.',
  },
  {
    id: 'oracao', classId: 'acolito', name: 'Oração', minClassLevel: 3, passive: false, peCost: 0,
    costNote: '1x por dia',
    text: 'Uma vez por dia, pode realizar uma oração como ação de movimentação para recuperar 1d6 PE. Realize um teste de FÉ(20), se passar recupera mais 1d6.',
  },
  {
    id: 'repreensao', classId: 'acolito', name: 'Repreensão', minClassLevel: 3, passive: false, peCost: 2,
    text: 'Em posse de um catalisador sagrado, gaste 2 PE para repreender uma criatura maligna com um teste de FÉ. Caso acerte, causa 2d6 de dano sagrado, Crítico 18.',
  },
  {
    id: 'bencao', classId: 'acolito', name: 'Benção', minClassLevel: 3, passive: false, peCost: 3,
    text: 'Em posse de um catalisador sagrado, gaste 3 PE para curar um aliado voluntário em 1d4. Caso passe num teste de FÉ(20), cure mais 1d4.',
  },
  {
    id: 'lamina-sagrada', classId: 'acolito', name: 'Lâmina Sagrada', minClassLevel: 6, passive: false, peCost: 5,
    text: 'Gaste 5 PE e uma ação de movimentação para abençoar uma lâmina com luz sagrada. Some sua FÉ ao dano final da arma como dano Sagrado. Essa lâmina se torna capaz de acertar entidades imateriais, mas causa apenas o dano sagrado no acerto. O efeito dura um dia.',
  },
  {
    id: 'rogar', classId: 'acolito', name: 'Rogar', minClassLevel: 6, passive: false, peCost: 2,
    text: 'Gaste 2 PE para somar sua FÉ em testes aliados.',
  },
  {
    id: 'iluminacao', classId: 'acolito', name: 'Iluminação', minClassLevel: 6, passive: true,
    text: 'Recebe 5 de RD contra dano mágico.',
    effect: { rdMagic: 5 },
  },
  {
    id: 'cssml', classId: 'acolito', name: 'CSSML', minClassLevel: 9, passive: false,
    costNote: 'toda a PE',
    text: 'Se torna apto para executar um expurgo de uma entidade maligna EXPOSTA. Gaste toda sua PE para executar. Caso não tenha pelo menos 20 PE disponíveis, faça um teste de FÉ(10+PE faltantes). Se falhar, fica inconsciente por 8 horas.',
  },

  // ── OCULTISTA ──────────────────────────────────────────────────────────────
  {
    id: 'estudo', classId: 'ocultista', name: 'Estudo', minClassLevel: 1, passive: true,
    text: '2 + INT de PE.',
    effect: { peMax: { base: 2, attr: 'INT' } },
  },
  {
    id: 'sobriedade', classId: 'ocultista', name: 'Sobriedade', minClassLevel: 1, passive: true,
    text: 'Todas as conjurações mágicas custam 1 PE a menos (mínimo 1).',
  },
  {
    id: 'aplicacao', classId: 'ocultista', name: 'Aplicação', minClassLevel: 1, passive: true,
    text: '+2 em todos os testes de conjurações mágicas.',
  },
  {
    id: 'combusto', classId: 'ocultista', name: 'Combusto', minClassLevel: 3, passive: false, peCost: 2,
    text: 'Gaste 2 PE para causar uma explosão de chamas de 2d6 de dano ao alcance de toque.\n\nPode gastar mais 1 PE para aumentar o dano em mais 1d6.\n\nPode realizar um truque, removendo o custo, o dano e aumentando o alcance para curto. Essa pequena explosão pode acender velas ou itens altamente inflamáveis. O objeto deve estar visível ao conjurador.',
  },
  {
    id: 'figre', classId: 'ocultista', name: 'Figre', minClassLevel: 3, passive: false, peCost: 2,
    text: 'Gaste 2 PE para convocar raízes em alcance curto e controlá-las por um instante antes de se solidificarem. Caso acerte um alvo, o AFUGENTA FISICAMENTE.\n\nPode gastar mais 2 PE para realizar uma manobra de combate com as raízes somando seu INT ao teste.\n\nPode gastar mais 1 PE para aumentar o alcance para médio.\n\nPode realizar um truque, removendo custo mudando o alcance para alcance médio. Pode movimentar plantas levemente à sua vontade, podendo abrir caminho entre matas fechadas ou chamar atenção.',
  },
  {
    id: 'cliostra', classId: 'ocultista', name: 'Cliostra', minClassLevel: 3, passive: false, peCost: 2,
    text: 'Gaste 2 PE para manipular um objeto metálico ao alcance médio. Se o objeto pertencer a uma criatura, ela pode realizar um teste oposto para resistir. Pode mover o objeto por 1.5m e mais 1.5m para cada 5 pontos acima da CD do teste. Objetos pesados têm CD maior. Objetos que não puderem se mover na direção ordenada sofrem 1d4 de dano para cada 1.5m aplicados.\n\nGaste 3 PE para potencializar, recebendo +5 no teste.\n\nGaste 2 PE para pressionar, aumentando o dano a objetos para 1d6.\n\nPode realizar um truque, removendo custos. Pode movimentar objetos em seu próprio eixo, sem deslocamento. Útil para fechar uma porta com trinco de ferro ou derrubar uma chave.',
  },
  {
    id: 'termodrium', classId: 'ocultista', name: 'Termodrium', minClassLevel: 6, passive: false, peCost: 5,
    text: 'Gaste 5 PE para alterar a temperatura de uma criatura ou objeto à alcance médio para mais ou menos. Causando 6 + 1d6 de dano de fogo ou frio mais 1d6 para cada 5 pontos além da CD estimada. FÉ(20) reduz à metade.\n\nGaste 5 PE para afetar todas as criaturas em alcance médio, exceto você.\n\nGaste 3 PE para potencializar, recebendo +5 no teste.',
  },
  {
    id: 'dolonotre', classId: 'ocultista', name: 'Dolonotre', minClassLevel: 6, passive: false, peCost: 5, pvCost: 2,
    text: 'Gaste 5 PE e 2 PV para praguejar contra uma criatura, fazendo com que sofra fortes dores e feridas de praga, causando 4d6 de dano profano. FÉ(25) reduz o dano à metade.\n\nGaste 5 PV para aumentar o dano para 6d6.',
  },
  {
    id: 'sacrificio', classId: 'ocultista', name: 'Sacrifício', minClassLevel: 6, passive: false, peCost: 0, pvCost: 3,
    text: 'Gaste 3 PV para receber 5 pontos em um teste qualquer. Não cumulativo.',
  },
  {
    id: 'pacto', classId: 'ocultista', name: 'Pacto', minClassLevel: 9, passive: false,
    costNote: '15 entre PE e PV permanentes',
    text: 'Sacrifique um total de 15 entre PE e PV permanentemente para conseguir uma intervenção de uma entidade maligna voluntária à sua escolha. Não pode cair para menos de 1 PV (Anemia e fragilidade corporal) e menos de 0 PE (um corpo sem alma).\n\nCaso o pacto falhe, perde os recursos atuais, não os permanentes. Se não tiver recursos atuais para perder, completará o sacrifício com os permanentes.\n\nEscolha um dos desejos a seguir:\n\nPODER: Receba capacidades sobre-humanas por 1 hora. Durante esse período: +10 em todos os testes de FOR, CON E DES; Seu PV total é dobrado, maximizado e curado em 2d6 no início de todos os seus turnos como ação livre; Seu PE é dobrado; Testes de INT, PRE e FÉ recebem 1 VANTAGEM; Efeitos sagrados causam dano à você e adornos sagrados são expelidos.\n\nACESSO: Teleporta a si e até 10 criaturas voluntárias para qualquer localidade que conheça ou que tenha a descrição num raio de 1.000km. Mapas e imagens funcionam se forem precisos. Caso utilize um mapa irregular, uma pintura ou uma descrição de outra pessoa, aparece a 1d10 km do lugar desejado. Se o lugar for longe demais ou não existir, o pacto falha.\n\nVIDA: Traz de volta à vida uma criatura que morreu há até 7 dias. É necessário que o corpo esteja estável e que haja matéria orgânica original suficiente para reconstruir o que faltar. Corpos despedaçados podem ser reconstruídos, mas partes faltantes não serão repostas a não ser que haja um sacrifício equivalente: Braço por braço, pele por pele, cabeça por cabeça. Um corpo ressuscitado retorna com PV maximizado, mas morrerá exatamente 7 anos após sua ressurreição.\n\nFORTUNA: Transforma até 10kg de metal em 10kg de ouro 24 quilates. Todo o material deve estar visível e separado em um círculo ritual. Se não houver um círculo ritual, o pacto falha.',
  },

  // ── VIDENTE ────────────────────────────────────────────────────────────────
  {
    id: 'lampejos', classId: 'vidente', name: 'Lampejos', minClassLevel: 1, passive: true,
    text: 'Receba sua PRE como CLAREZA total.',
    effect: { peMax: { base: 0, attr: 'PRE' } },
  },
  {
    id: 'sexto-sentido', classId: 'vidente', name: 'Sexto Sentido', minClassLevel: 1, passive: true,
    text: 'Some PRE a sua defesa.',
    effect: { def: { base: 0, attr: 'PRE' } },
  },
  {
    id: 'personalidade', classId: 'vidente', name: 'Personalidade', minClassLevel: 1, passive: true,
    text: 'Some 2 + PRE aos seus PE.',
    effect: { peMax: { base: 2, attr: 'PRE' } },
  },
  {
    id: 'premonicao', classId: 'vidente', name: 'Premonição', minClassLevel: 3, passive: false, peCost: 10,
    text: 'Ao fim de qualquer teste que não seja uma PREMONIÇÃO, seu ou de outra criatura, pode gastar 10 PE para transformar aquela ação numa PREMONIÇÃO anterior ao evento. O resultado será o mesmo caso a ação não seja interrompida ou alterada. Uma premonição tem limite de 6 segundos para ações narrativas. Recebe uma ação livre de comunicação rápida quando feito fora de seu turno. Usar premonição contra um ataque ou alertar um aliado aumenta a defesa em 5 + PRE.',
  },
  {
    id: 'memorium-vitre', classId: 'vidente', name: 'Memorium Vitre', minClassLevel: 3, passive: false, peCost: 3,
    text: 'Gaste 3 PE para acessar os ecos de um espaço físico limitado. A CD(PRE) é determinada pela dificuldade de acesso ao eco. Pode gastar 2 PE para refazer o teste em caso de falha.',
  },
  {
    id: 'religare', classId: 'vidente', name: 'Religare', minClassLevel: 3, passive: false, peCost: 3,
    text: 'Gaste 3 PE para acessar a mente de um alvo inconsciente ou que dê permissão ativamente. Cada cenário exige um teste de PRE baseado na carga emocional ou relevância: quanto maior, mais difícil. Caso o teste falhe, pode gastar 2 PE para tentar de novo ou perder o acesso. A comunicação externa fica livre enquanto estiver dentro da mente.',
  },
  {
    id: 'triviratium', classId: 'vidente', name: 'Triviratium', minClassLevel: 6, passive: false, peCost: 10,
    text: 'Gaste 10 PE para reprimir o avanço da invasão de uma entidade no plano espiritual de volta para a MANIFESTAÇÃO. Entidades menores não conseguem voltar (vagantes, inocentes). Entidades experientes ou divinas ficam atordoadas e um teste de PRE estende a duração de acordo com o poder da entidade.',
  },
  {
    id: 'apartae', classId: 'vidente', name: 'Apartae', minClassLevel: 6, passive: false, peCost: 10,
    text: 'Gaste 10 de PE para projetar-se para fora de seu corpo no plano espiritual, entrando na FORMA ASTRAL. Este estado permite contatar entidades manifestadas, atingi-las "fisicamente" e transitar no espaço entre mundos. Para manter a linearidade do espaço transitado, realize um teste de PRE(20). Se falhar, acessa um lugar aleatório e desconexo do plano real. Pode gastar 2 PE para refazer o teste no caso de falha.',
  },
  {
    id: 'cronus', classId: 'vidente', name: 'Cronus', minClassLevel: 6, passive: false, peCost: 2,
    costNote: '2, 4, 6, 8…',
    requires: { ability: 'premonicao' },
    text: 'Gaste 2 PE para checar possibilidades futuras baseadas em sua ação. Cada possibilidade que testar ocorrerá exatamente como o visto caso escolha esse desfecho, mas custam mais caro a cada checagem: 2, 4, 6, 8 e assim por diante (Reseta em descanso longo). CRONUS prevê o tempo de um turno completo ou 6 segundos em ações narrativas.',
  },
  {
    id: 'factum', classId: 'vidente', name: 'Factum', minClassLevel: 9, passive: false, peCost: 5,
    costNote: '5 + 1 por ponto acima de 10; 20 natural = 20',
    text: 'Uma vez por descanso longo, pode determinar o resultado de um dado individual ou de um terceiro antes de ser rolado. Gaste 5 PE + 1 PE por ponto acima de 10, até 9 para um 19 natural. Caso escolha um 20, gaste 20 PE. Para criaturas hostis, o dado é oposto. O destino definido se torna imutável.',
  },

  // ── COMBATENTE ─────────────────────────────────────────────────────────────
  {
    id: 'violencia', classId: 'combatente', name: 'Violência', minClassLevel: 1, passive: true,
    requires: { attr: { key: 'FOR', min: 1 } },
    text: 'Some sua Força no dano final aplicado por seus golpes.',
    effect: { damageAttr: 'FOR' },
  },
  {
    id: 'atencao', classId: 'combatente', name: 'Atenção', minClassLevel: 1, passive: true,
    text: '+2 de Defesa.',
    effect: { def: { base: 2 } },
  },
  {
    id: 'vitalidade', classId: 'combatente', name: 'Vitalidade', minClassLevel: 1, passive: true,
    text: '2 + CON de PV.',
    effect: { pvMax: { base: 2, attr: 'CON' } },
  },
  {
    id: 'golpe-tatico', classId: 'combatente', name: 'Golpe Tático', minClassLevel: 3, passive: false, peCost: 1,
    text: 'Gaste 1 PE para realizar um golpe tático contra um inimigo. Caso acerte, ganha direito a uma Manobra de Combate como ação livre.',
  },
  {
    id: 'postura-defensiva', classId: 'combatente', name: 'Postura Defensiva', minClassLevel: 3, passive: false, peCost: 1,
    text: 'Gaste 1 PE para assumir essa postura até seu próximo turno. Deve ser ativado como ação livre no início de seu turno. A postura concede -2 em todos os testes de ataque, +2 em todos os testes de manobra de combate e +5 de defesa.',
  },
  {
    id: 'dominacao', classId: 'combatente', name: 'Dominação', minClassLevel: 3, passive: false, peCost: 1,
    text: 'Gaste 1 PE para receber +5 em um teste de manobra de combate. Manobras que causam dano recebem +5 no dano.',
  },
  {
    id: 'bravura', classId: 'combatente', name: 'Bravura', minClassLevel: 6, passive: false,
    costNote: '1 PE → 2 PV',
    text: 'Gaste uma ação de movimentação para converter pontos de PE em PV. A proporção de conversão é de 1 PE por 2 PV.',
  },
  {
    id: 'furia', classId: 'combatente', name: 'Fúria', minClassLevel: 6, passive: false, peCost: 2,
    text: 'Gaste 2 PE para ativar a fúria. Ganha +3 nos testes de ataque e de dano. Caso não ataque nem seja atacado durante a rodada ou o combate termine, sua fúria se encerra. Fica impossibilitado de realizar ações que requeiram concentração e calma (Conjurar, ler, resolver enigmas, etc.).',
  },
  {
    id: 'inabalavel', classId: 'combatente', name: 'Inabalável', minClassLevel: 6, passive: true,
    text: 'Ficar com 0 de PV não te deixa mais inconsciente.',
    effect: { noUnconscious: true },
  },
  {
    id: 'maestria-de-combate', classId: 'combatente', name: 'Maestria de Combate', minClassLevel: 9, passive: false, peCost: 2,
    text: 'Gaste 2 PE para realizar mais um ataque após uma ação de ataque. Limite de 1 por turno.',
  },
];

export const ABILITIES: Record<string, Ability> = Object.fromEntries(A.map((a) => [a.id, a]));

export const ABILITY_LIST: Ability[] = A;

export function abilitiesOf(classId: ClassId): Ability[] {
  return A.filter((a) => a.classId === classId);
}

export function getAbility(id: string): Ability | undefined {
  return ABILITIES[id];
}
