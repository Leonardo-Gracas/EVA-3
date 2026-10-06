# EVA 3 — instruções para o Claude

## Exploração de código: use o codebase-memory-MCP

Sempre use as ferramentas do **codebase-memory-mcp** primeiro para explorar o código
(projeto `C-Users-leona-OneDrive-Documentos-Visual-Studio-Code-eva3`):

- `search_graph` para achar funções, componentes, tipos e variáveis;
- `get_code_snippet` para ler o código de um símbolo;
- `trace_path` para cadeias de chamada;
- `search_code` para busca textual enriquecida pelo grafo;
- `get_architecture` para a visão geral.

Se o projeto não estiver indexado (ou o índice estiver desatualizado após mudanças grandes),
rode `index_repository` antes. Grep/Glob/Read ficam para textos, configs e arquivos não-código,
e sempre leia o arquivo antes de editá-lo.

## Projeto

- React + TypeScript + Vite. Verificação: `npx tsc --noEmit -p .` e `npm test`.
- Interface e textos em português do Brasil.
- Ações do jogo passam por `useAct().act(...)` (`src/components/act.tsx`); botões ligados a permissões usam `ActButton`.
- Alterações de PV, PE e durabilidade de itens usam o modal compartilhado `src/components/common/ResourceAdjust.tsx`.
