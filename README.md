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

A localização da biblioteca **não é mais um caminho fixo no código** — o painel abre um
seletor de pastas nativo do sistema operacional, então funciona tanto no Windows quanto no
macOS, apontando para onde quer que sua pasta de assets esteja.

## Requisitos

- **Windows 11** ou **macOS**
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
    `EventManager` / `Constants.ProjectEvent`.
  - `require("uxp").storage.localFileSystem` → `getFolder()` (seletor nativo de pastas,
    funciona igual no Windows e no macOS), `Folder.getEntries()` para navegar nas
    subpastas/arquivos, e `createPersistentToken()` / `getEntryForPersistentToken()` para
    lembrar da pasta escolhida entre sessões, com a permissão `"localFileSystem": "request"`
    declarada no `manifest.json` (o usuário concede acesso apenas à pasta que ele escolher,
    não ao disco inteiro).
  - `path` (módulo global do UXP) para manipulação de nomes/extensões.

### Limitações conhecidas (documentadas pela Adobe, não contornadas às escondidas)

- Os hooks de ciclo de vida `hide()` e `destroy()` de painel **não são confiáveis** no
  Premiere atualmente. Por isso a inicialização do painel acontece no evento `load` da
  janela (mesmo padrão usado nos samples oficiais da Adobe), e não nesses hooks.
- Não há, na referência pesquisada, uma API de geração de thumbnail/frame-grab — por isso o
  MVP usa um badge colorido por tipo de arquivo (VID/AUD/IMG/MGT/PST) em vez de thumbnail
  real.
- O token persistente que lembra a pasta escolhida não é garantido para sempre — a própria
  documentação da Adobe avisa que mover/apagar a pasta, ou o SO revogar a permissão, pode
  invalidá-lo. Quando isso acontece, o plugin detecta o erro e volta a pedir para o usuário
  selecionar a pasta novamente (sem travar).
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
    │   └── settings.js       ← constantes gerais (nome do plugin)
    ├── utils/
    │   └── fsUtils.js        ← wrapper sobre a API de Entry (Folder/File) do UXP
    ├── library/
    │   ├── libraryLocation.js ← seletor de pasta + token persistente (Windows/macOS)
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

Na primeira vez que o painel abrir, ele vai mostrar um botão **"📁 Selecionar Pasta da
Biblioteca"** — clique nele e escolha, no seletor nativo do seu sistema operacional, a pasta
onde ficam os seus assets. Funciona igual no Windows e no macOS; não existe mais um caminho
fixo no código.

Exemplo de estrutura (qualquer nome/local serve, isto é só ilustrativo):

```
Premiere Library/
├── Transitions/
├── Sound Effects/
├── Whooshes/
├── Text/
├── Overlays/
├── Effects/
└── Presets/
```

Cada subpasta de primeiro nível vira uma categoria automaticamente — não é preciso alterar
código para adicionar uma categoria nova, basta criar a pasta e clicar em **Refresh Library**.

Os assets **nunca** são copiados para dentro do plugin — ele só lê a pasta escolhida. Você
pode adicionar, remover, reorganizar e fazer backup dela livremente.

A escolha é lembrada entre sessões (via token persistente do UXP), então você não precisa
selecionar de novo toda vez que abrir o Premiere. Para trocar de pasta a qualquer momento,
clique no ⚙ no topo do painel e depois em **"Trocar pasta da biblioteca"**.

## Instalação (Windows 11 ou macOS)

1. Instale o **Creative Cloud Desktop** e, dentro dele, o **UXP Developer Tool (UDT)**.
2. No Premiere Pro: **Edit/Settings → Plugins → Enable developer mode** (marque a caixa) e
   reinicie o Premiere.
3. Clone/baixe este repositório em qualquer pasta do seu computador, por exemplo
   `C:\Dev\KVNLibrary` (Windows) ou `~/Dev/KVNLibrary` (macOS).
4. (Opcional, só para autocomplete no editor) na raiz do projeto:
   ```
   npm install
   ```
5. Tenha uma pasta com seus assets em algum lugar do disco (pode ser em qualquer local — você
   vai selecioná-la de dentro do painel, no primeiro passo do teste abaixo).

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
3. Clique em **"📁 Selecionar Pasta da Biblioteca"** e escolha a pasta com seus assets.
4. Veja as categorias detectadas automaticamente a partir das subpastas.
5. Clique em `Transitions` (ou outra categoria com arquivos).
6. Veja os arquivos listados na grade.
7. Clique em um asset para selecioná-lo (ou dê duplo clique para importar direto).
8. Clique em **Importar para o Projeto**.
9. Confira o asset aparecendo no **Project Panel** do Premiere.
10. Adicione um arquivo novo na pasta correspondente no disco, volte ao painel e clique em
    **Refresh Library (↻)** — o novo arquivo deve aparecer sem reiniciar o Premiere.

## Tratamento de erros

O painel mostra mensagens específicas (não falha silenciosamente) para:

- Nenhuma pasta de biblioteca selecionada ainda (tela de boas-vindas com botão de seleção).
- Token de acesso à pasta inválido (pasta movida/apagada, permissão revogada) — volta a pedir
  a seleção em vez de travar.
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
- **V4**: tags, subcategorias, múltiplas bibliotecas, histórico de assets usados.
- **V5**: suporte dedicado a MOGRT/presets, instalação de assets pelo próprio painel,
  gerenciamento avançado da biblioteca.

Cada uma dessas etapas exige verificar a API correspondente na documentação oficial antes de
implementar — nenhuma foi assumida como existente neste momento.
