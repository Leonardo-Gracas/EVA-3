# EVA 3

Gerenciador de campanhas online para o sistema de RPG **EVA 3**. O navegador do mestre é o servidor da mesa: guarda tudo, aplica as regras e conversa com os jogadores por P2P (PeerJS). O site é estático e pode ser publicado no Netlify; nenhum dado de jogo passa pelo servidor.

## Como funciona

1. Quem abre o site escolhe um nome de usuário (fica salvo no navegador).
2. **Criar mesa**: vira mestre e recebe um código de 6 caracteres, um link `/sala/CODIGO` e um QR.
3. **Entrar com código**: vira jogador, monta a ficha no assistente e envia para o mestre aprovar.
4. Durante o jogo, cada ação do jogador segue as permissões que o mestre definiu: **livre**, **solicitar** (vira pedido na aba Pedidos) ou **bloqueada**. Há permissão global e exceções por jogador.

A mesa fica salva no IndexedDB do navegador do mestre (salvamento automático) e pode ser exportada e importada como `.json` pelo botão **Backup** e pelo lobby. Se o mestre recarregar a página, a sala reabre com o mesmo código e os jogadores reconectam sozinhos.

## Regras no código

Ficha, classes e habilidades são estáticas, em `src/rules/`:

- `attributes.ts`: FOR, CON, DES, FÉ, INT, PRE; compra de 10 pontos (−1 a +4).
- `classes.ts`: Combatente, Acólito, Ocultista, Vidente; PV/PE por classe; títulos das duplas (General, Paladino, Bruxo…).
- `abilities.ts`: todas as habilidades, com requisito de nível de classe, custo e efeitos passivos.
- `derive.ts`: PV/PE máximos, DEF (10 + DES), VON (10 + FÉ), bônus de teste em nível par, limiar de morte (o mais negativo entre −10 e −PV/2).
- `validate.ts`: até 2 classes, 1 habilidade por nível, pré-requisitos.

Itens são dados: o mestre mantém uma biblioteca e entrega aos personagens; jogadores podem adicionar/editar itens no próprio inventário conforme as permissões.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # regras e motor da mesa
npm run build    # gera dist/
```

Para testar mestre e jogador na mesma máquina, abra duas janelas (uma anônima) ou dois navegadores.

### Servidor PeerJS próprio (opcional)

Por padrão a apresentação entre navegadores usa o servidor público `0.peerjs.com`. Para usar outro, defina no build:

```
VITE_PEER_HOST=meu-servidor.com
VITE_PEER_PORT=443
VITE_PEER_PATH=/
VITE_PEER_SECURE=1
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

e acrescente o host em `connect-src` no `netlify.toml`.

## Deploy no Netlify

O `netlify.toml` já define build (`npm run build`), pasta `dist`, redirecionamento SPA e cabeçalhos de segurança. Basta conectar o repositório no Netlify.

## Estrutura

```
src/
  rules/       regras estáticas (testadas em rules.test.ts)
  model/       tipos da mesa, ações e permissões
  store/       motor (engine.ts), visão do jogador, persistência e backup
  net/         sala P2P: host (mestre), guest (jogador), identidade
  components/  ficha, assistente de criação, painéis do mestre, dados
  pages/       nome, lobby, mestre, jogador
```

Partes da conexão (código de sala, reconexão, convite com QR, IndexedDB) foram adaptadas do EVA S; componentes e tema seguem o Mesa20.
