# KVN Library

Painel UXP para o Adobe Premiere Pro que dá acesso, de dentro do próprio Premiere, a uma
biblioteca pessoal e local de assets (transições, efeitos sonoros, overlays, presets etc.),
sem depender de assinatura, serviço externo ou biblioteca proprietária de terceiros.

Este projeto **não** usa código nem assets de nenhum produto de terceiros. É uma ferramenta
própria, pensada para uma biblioteca pessoal guardada em disco.

## Status: MVP

O fluxo abaixo já funciona de ponta a ponta:

> Abrir painel → ver categorias → entrar em uma categoria → ver assets → selecionar →
> importar → asset aparece no Project Panel do Premiere → Refresh detecta arquivos novos.

O que **não** está implementado ainda (de propósito — ver "Próximos passos"): busca,
thumbnails reais, inserção na timeline/playhead, drag & drop, tags, múltiplas bibliotecas,
suporte dedicado a MOGRT.

## Requisitos

- **Windows 11**
- **Adobe Premiere Pro 25.6** ou mais recente, com **suporte a UXP** (versão em que a Adobe
  estabilizou a nova plataforma de extensibilidade, substituindo CEP/ExtendScript)
- **UXP Developer Tool (UDT) 2.2+** — instalado via Creative Cloud Desktop
- **Node.js** (LTS 18.x ou mais recente) — usado apenas para obter os tipos de
  desenvolvimento (`@adobe/premierepro`), não há build/bundler
- Um editor de código (ex.: VS Code)

## Por que UXP (e não CEP/ExtendScript)

Pesquisa feita diretamente na documentação oficial da Adobe (`AdobeDocs/uxp-premiere-pro` e
`AdobeDocs/uxp-premiere-pro-samples`) antes de escrever qualquer código:

- CEP está sendo descontinuado; ExtendScript segue funcionando apenas até setembro de 2026.
- UXP é a plataforma de extensibilidade atual e oficialmente recomendada pela Adobe para
  plugins novos, com engine JavaScript unificada (sem a ponte `CSInterface` do CEP).
- APIs usadas neste plugin, todas confirmadas na referência oficial:
  - `require("premierepro")` → `Project.getActiveProject()`, `Project.importFiles()`,
    `Project.getRootItem()`, `EventManager` / `Constants.ProjectEvent`.
  - `require("fs")` (API estilo Node.js) para ler a pasta local da biblioteca, com a
    permissão `"localFileSystem": "fullAccess"` declarada no `manifest.json`.
  - `path` (módulo global do UXP) para manipulação de caminhos.

### Limitações conhecidas (documentadas pela Adobe, não contornadas às escondidas)

- Os hooks de ciclo de vida `hide()` e `destroy()` de painel **não são confiáveis** no
  Premiere atualmente. Por isso a inicialização do painel acontece no evento `load` da
  janela (mesmo padrão usado nos samples oficiais da Adobe), e não nesses hooks.
- Não há, na referência pesquisada, uma API de geração de thumbnail/frame-grab — por isso o
  MVP usa um badge colorido por tipo de arquivo (VID/AUD/IMG/MGT/PST) em vez de thumbnail
  real.
- A permissão `"fullAccess"` de sistema de arquivos é ampla: foi a opção necessária para ler
  um caminho fixo (`D:\KVN\Premiere Library`) sem exigir seleção manual do usuário toda vez
  que o painel abre. O usuário verá um consentimento de permissão local (sem rede) na
  primeira vez que o plugin acessar o disco.
- Inserção automática na timeline/posição do playhead **não foi implementada** neste MVP —
  a pesquisa inicial focou em `importFiles` (Project Panel). Isso fica para a V3, quando a
  API correspondente for pesquisada e confirmada da mesma forma.

## Estrutura do projeto

```
KVNLibrary/                  ← raiz do plugin (é isso que o UDT carrega)
├── manifest.json            ← metadados, permissões e entrypoint de painel
├── index.html                ← shell da UI
├── index.js                  ← ponto de entrada JS (carrega src/ui/app.js)
├── package.json / jsconfig.json  ← apenas tipos de desenvolvimento, sem build
└── src/
    ├── config/
    │   └── settings.js       ← caminho padrão da biblioteca (D:\KVN\Premiere Library)
    ├── utils/
    │   └── fsUtils.js        ← wrapper sobre "fs" e "path" do UXP
    ├── library/
    │   ├── categoryManager.js ← lê subpastas de 1º nível = categorias
    │   ├── assetManager.js    ← lê arquivos de uma categoria e classifica por tipo
    │   └── libraryManager.js  ← orquestra + cache em memória (evita reler o disco)
    ├── premiere/
    │   ├── premiereBridge.js  ← ponto único de require("premierepro")
    │   ├── projectManager.js  ← projeto ativo + evento ACTIVATED
    │   └── importManager.js   ← Project.importFiles() com tratamento de erro
    └── ui/
        ├── app.js             ← controlador da UI (estado, eventos, navegação)
        ├── components/        ← renderização pura (categorias, grade de assets, status)
        └── styles/theme.css   ← tema escuro compacto
```

A separação existe para que funcionalidades futuras (thumbnails reais, busca, múltiplas
bibliotecas, timeline) entrem em módulos novos ou nas mesmas pastas, sem reescrever o
restante.

## Biblioteca local

O caminho padrão é `D:\KVN\Premiere Library\`, configurado em `src/config/settings.js`
(`getLibraryRootPath()`). Cada subpasta de primeiro nível vira uma categoria automaticamente
— não é preciso alterar código para adicionar uma categoria nova, basta criar a pasta:

```
D:\KVN\Premiere Library\
├── Transitions\
├── Sound Effects\
├── Whooshes\
├── Text\
├── Overlays\
├── Effects\
└── Presets\
```

Os assets **nunca** são copiados para dentro do plugin — o plugin só lê o caminho
configurado. Você pode adicionar, remover, reorganizar e fazer backup da pasta livremente;
clique em **Refresh Library** no painel para o plugin reler o disco.

Para alterar o caminho por enquanto, edite `DEFAULT_LIBRARY_ROOT_PATH` em
`src/config/settings.js` (uma tela de configurações fica para uma versão futura, conforme
combinado no escopo do MVP).

## Instalação (Windows 11)

1. Instale o **Creative Cloud Desktop** e, dentro dele, o **UXP Developer Tool (UDT)**.
2. No Premiere Pro: **Edit/Settings → Plugins → Enable developer mode** (marque a caixa) e
   reinicie o Premiere.
3. Clone/baixe este repositório em qualquer pasta do Windows, por exemplo `C:\Dev\KVNLibrary`.
4. (Opcional, só para autocomplete no editor) na raiz do projeto:
   ```
   npm install
   ```
5. Crie a estrutura de pastas da sua biblioteca em `D:\KVN\Premiere Library\` (ou ajuste o
   caminho em `src/config/settings.js` antes deste passo, se quiser usar outro local).

## Desenvolvimento / como testar no Premiere

1. Abra o Premiere Pro com um projeto (novo ou existente).
2. Abra o **UXP Developer Tool**; ele deve listar o Premiere em "Connected apps".
3. No UDT, clique em **Add Plugin** (ou **Create Plugin → Import** dependendo da versão) e
   aponte para a pasta `KVNLibrary` (a que contém `manifest.json`).
4. Clique em **Load & Watch** na linha do plugin. Isso carrega o painel no Premiere e recarrega
   automaticamente a cada alteração salva no código.
5. No Premiere, abra o painel em **Window → UXP Plugins → KVN Library**.

Se você alterar `manifest.json`, é necessário **Unload** e **Load & Watch** novamente no UDT
(mudanças de manifesto não são pegas pelo watch automático).

## Teste do fluxo completo (critério de sucesso do MVP)

1. Abra o Premiere Pro e um projeto.
2. Abra o painel **KVN Library** (`Window → UXP Plugins → KVN Library`).
3. Veja as categorias detectadas automaticamente a partir das subpastas de
   `D:\KVN\Premiere Library\`.
4. Clique em `Transitions` (ou outra categoria com arquivos).
5. Veja os arquivos listados na grade.
6. Clique em um asset para selecioná-lo (ou dê duplo clique para importar direto).
7. Clique em **Importar para o Projeto**.
8. Confira o asset aparecendo no **Project Panel** do Premiere.
9. Adicione um arquivo novo na pasta correspondente no disco, volte ao painel e clique em
   **Refresh Library (↻)** — o novo arquivo deve aparecer sem reiniciar o Premiere.

## Tratamento de erros

O painel mostra mensagens específicas (não falha silenciosamente) para:

- Pasta da biblioteca não encontrada no caminho configurado.
- Categoria vazia.
- Nenhum projeto aberto no Premiere no momento da importação.
- Falha reportada pela API do Premiere ao importar um arquivo.
- Entradas do disco ilegíveis (permissão insuficiente) — são ignoradas na listagem em vez de
  travar o painel inteiro.

## Performance

- Ao abrir o painel, só a lista de categorias (nomes de pastas) é lida — nenhum arquivo é
  varrido antecipadamente.
- Os arquivos de uma categoria só são lidos quando o usuário entra nela (sob demanda).
- Um cache em memória evita reler o disco ao reabrir uma categoria já visitada; o cache só é
  invalidado no clique em **Refresh Library**.

## Próximos passos (fora do escopo deste MVP)

- **V2**: thumbnails reais, preview, busca funcional, favoritos, filtros.
- **V3**: drag & drop, inserção na timeline, inserção na posição do playhead, escolha de track.
- **V4**: tags, subcategorias, múltiplas bibliotecas, tela de configuração de caminho,
  histórico de assets usados.
- **V5**: suporte dedicado a MOGRT/presets, instalação de assets pelo próprio painel,
  gerenciamento avançado da biblioteca.

Cada uma dessas etapas exige verificar a API correspondente na documentação oficial antes de
implementar — nenhuma foi assumida como existente neste momento.
