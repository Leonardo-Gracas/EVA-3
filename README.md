# EVA 3

Gerenciador de campanhas online para o sistema de RPG **EVA 3**. O navegador do mestre é o servidor da mesa: guarda tudo, aplica as regras e conversa com os jogadores através de um servidor de salas na Cloudflare, que só repassa as mensagens. O site é estático e fica no Netlify.

**Acesse o app:** https://eva-3.netlify.app/

## Como funciona

1. Quem abre o site escolhe um nome de usuário (fica salvo no navegador).
2. **Criar mesa**: vira mestre e recebe um código de 6 caracteres, um link `/sala/CODIGO` e um QR. Marcando **Começar com itens e ameaças padrão**, a mesa já nasce com a biblioteca de itens e o painel de ameaças preenchidos (dá para editar ou apagar tudo depois).
3. **Entrar com código**: vira jogador, monta a ficha no assistente e envia para o mestre aprovar.
4. Durante o jogo, cada ação do jogador segue as permissões que o mestre definiu: **livre**, **solicitar** (vira pedido na aba Pedidos) ou **bloqueada**. Há permissão global e exceções por jogador.

A mesa fica salva no IndexedDB do navegador do mestre (salvamento automático) e pode ser exportada e importada como `.json` pelo botão **Backup** e pelo lobby. Se o mestre recarregar a página ou voltar outro dia, a sala reabre com o mesmo código e os jogadores reconectam sozinhos.

## Regras no código

Ficha, classes e habilidades são estáticas, em `src/rules/`:

- `attributes.ts`: FOR, CON, DES, FÉ, INT, PRE; compra de 10 pontos (−1 a +4).
- `classes.ts`: Combatente, Acólito, Ocultista, Vidente; PV/PE por classe; títulos das duplas (Veterano, Paladino, Bruxo…).
- `abilities.ts`: todas as habilidades, com requisito de nível de classe, custo e efeitos passivos.
- `derive.ts`: PV/PE máximos, DEF (10 + DES), VON (10 + FÉ), bônus de teste em nível par, limiar de morte (o mais negativo entre −10 e −PV/2).
- `validate.ts`: até 2 classes, 1 habilidade por nível, pré-requisitos.

O mestre também cria **NPCs** e **ameaças**. NPC é uma ficha comum, com as mesmas regras, mas sem jogador: nasce aprovada e fica oculta até o mestre torná-la visível (os jogadores veem só nome e conceito). Ameaça é uma ficha de combate com valores livres (atributos de −10 a 30, PV, PE, DEF, VON, RD, ataques e habilidades escritas pelo mestre), com botões de dano (aplica RD), ataque, rolagem de atributo e duplicar.

Itens são dados: o mestre mantém uma biblioteca e entrega aos personagens; jogadores podem adicionar/editar itens no próprio inventário conforme as permissões. Todo item tem valor e durabilidade (PV, RD e Defesa do objeto), que nasce com o padrão do tipo; qualquer item pode ser equipado e, enquanto equipado e inteiro, soma à ficha seus efeitos de DEF, RD física e RD mágica; com PV 0 fica quebrado e os efeitos param. Catalisadores podem ser sagrados, profanos ou etéreos. A ficha mostra RD física e RD mágica, e o mestre pode somar RD extra em Ajustes.

Além disso, a mesa tem:

- **Combate**: fila de turnos com personagens, NPCs e ameaças; o app passa os turnos, conta rodadas e condições, e os jogadores acompanham pelo celular.
- **Investigação**: casos e um mural de pistas em tela cheia.
- **Descanso**: o mestre escolhe quais personagens descansam.
- **Avatares**: criador de avatar dos personagens, no estilo picrew.
- **Exportar e importar fichas**: fichas saem e entram como `.json`, como personagem de jogador ou como NPC; o mestre também pode excluir jogadores da mesa.
- **Trilha sonora**: player do YouTube no canto inferior direito da tela do mestre (veja abaixo).

## Trilha sonora

Só o mestre ouve: o player é um iframe do YouTube na página do mestre e nada passa pela mesa nem pelo servidor de salas.
Recolhido, mostra tocar/pausar, anterior, próxima e volume. Expandido, mostra o vídeo, a posição na faixa, aleatório,
repetir (playlist, faixa ou nada), um campo para tocar qualquer link do YouTube e três abas:

- **Tocando**: a fila atual.
- **Do sistema**: playlists montadas no EVA colando links de vídeos. Ficam no `localStorage` do navegador do mestre
  (não entram no backup da mesa).
- **Minha conta**: as playlists da conta do YouTube do mestre (login Google, só leitura). Dá para copiá-las para "Do sistema".

Vídeos cujo dono proíbe tocar fora do YouTube (comum em clipes oficiais) são pulados com um aviso.

**Anúncios**: o player incorporado usa a sessão do youtube.com do navegador. Com YouTube Premium e logado no youtube.com
neste navegador, não há anúncios. Conectar a conta na aba "Minha conta" serve para listar as playlists; não muda os anúncios.
Navegadores que bloqueiam cookies de outros sites (Safari, Brave, Firefox estrito) podem mostrar anúncios mesmo com Premium.

**Configurar o login da conta** (uma vez; sem isto o resto funciona, só a aba "Minha conta" fica desligada):

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **YouTube Data API v3**.
2. Em **Tela de consentimento OAuth**, escolha "Externo", mantenha em modo de teste e adicione seu e-mail como usuário de teste.
3. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, tipo "Aplicativo da Web", com as origens JavaScript
   `https://eva-3.netlify.app` e `http://localhost:5173`.
4. Copie o ID do cliente para `VITE_GOOGLE_CLIENT_ID` (no Netlify, em variáveis de ambiente; localmente, num `.env`) e publique de novo.

A CSP do `netlify.toml` libera só o necessário: player e miniaturas do YouTube, login do Google e a API de playlists.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # regras e motor da mesa
npm run build    # gera dist/
```

Em modo dev o app usa o servidor de salas local (`ws://localhost:8787`). Rode os dois:

```bash
npm install --prefix server   # uma vez
npm run server                # servidor de salas em ws://localhost:8787
npm run dev                   # em outro terminal
```

Para testar mestre e jogador na mesma máquina, abra duas janelas (uma anônima) ou dois navegadores.

## Servidor de salas

Mestre e jogadores abrem uma conexão WebSocket (`wss://`, porta 443) com o servidor de salas (pasta `server/`:
Cloudflare Worker + um Durable Object por sala). Como ninguém precisa receber conexões, funciona atrás de qualquer
roteador, CGNAT ou rede móvel. O servidor não guarda nem lê a mesa: tudo o que um jogador manda vai só para o mestre, e o
mestre manda a cada jogador só a visão dele. O código da sala fica reservado ao navegador do mestre (por uma chave salva
nele) por até 30 dias sem uso; se a mesa for importada em outro navegador, ela ganha um código novo.

## Publicação

- **Servidor de salas (Cloudflare)**: na primeira vez e sempre que mudar `server/`, rode `publicar.cmd` (dois cliques).
  Ele instala as dependências do servidor, faz login na Cloudflare se precisar e roda `wrangler deploy`, que mostra o
  endereço `https://eva3-salas.leo-gracas.workers.dev`. `ALLOWED_ORIGINS` em `server/wrangler.toml` limita quais sites
  podem abrir salas.
- **Site (Netlify)**: publicado a cada `git push` na `main`. O endereço do servidor (`wss://eva3-salas.leo-gracas.workers.dev`)
  já vem em `src/net/socket.ts` e na CSP do `netlify.toml`; se ele mudar, troque nos dois (ou defina `VITE_SERVER_URL` no Netlify).

Custo: o plano grátis da Cloudflare (100 mil requisições por dia; cada 20 mensagens recebidas contam como 1) cobre com
folga sessões longas de uma mesa. Acima disso, o plano Workers Paid custa US$ 5/mês.

## Estrutura

```
server/       servidor de salas (Cloudflare Worker + Durable Object)
src/
  rules/       regras estáticas (testadas em rules.test.ts)
  model/       tipos da mesa, ações e permissões
  store/       motor (engine.ts), visão do jogador, persistência e backup
  net/         sala: host (mestre), guest (jogador), conexão com o servidor, identidade
  components/  ficha, assistente de criação, painéis do mestre, dados
  pages/       nome, lobby, mestre, jogador
```

Partes da conexão (código de sala, reconexão, convite com QR, IndexedDB) foram adaptadas do EVA S; componentes e tema seguem o Mesa20.
