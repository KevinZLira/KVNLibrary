# YouTube Importer — Extensão para Adobe Premiere Pro

Painel nativo do Premiere Pro para colar uma URL do YouTube, escolher exatamente
o trecho desejado e importá-lo direto para o **Project Panel** ou para a
**Timeline**, sem precisar abrir o Terminal ou baixar o vídeo inteiro manualmente.

```
URL → Carregar → Escolher trecho → Escolher mídia → Importar
```

---

## Sumário

1. [Arquitetura](#arquitetura)
2. [Requisitos](#requisitos)
3. [Instalação do yt-dlp](#instalação-do-yt-dlp)
4. [Instalação do FFmpeg](#instalação-do-ffmpeg)
5. [Instalação da extensão no Premiere](#instalação-da-extensão-no-premiere)
6. [Como usar](#como-usar)
7. [Configurações avançadas](#configurações-avançadas)
8. [Solução de problemas](#solução-de-problemas)
9. [Limitações conhecidas](#limitações-conhecidas)
10. [Estrutura do projeto](#estrutura-do-projeto)

---

## Arquitetura

O Premiere Pro expõe dois mecanismos de extensibilidade: **CEP** (Common
Extensibility Platform — painéis em HTML/CSS/JS, maduro, com acesso completo à
API de scripting `app.project`/`app.project.activeSequence`) e **UXP**, mais
novo mas, nas versões atuais do Premiere, com cobertura ainda parcial da API de
projeto/timeline. Como o objetivo é importar mídia para o Project Panel e
inserir clipes na timeline no playhead — operações que dependem da DOM de
scripting clássica do Premiere — este projeto usa **CEP com ExtendScript**,
que é a combinação estável e documentada para esse tipo de integração.

O painel **não é uma página web genérica**: ele roda dentro do processo do
Premiere, com três camadas bem separadas:

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (client/)                                          │
│  HTML/CSS/JS — painel dentro do Premiere (CEP UI)             │
└───────────────┬─────────────────────────────┬─────────────────┘
                 │ require() (Node.js)         │ evalScript() (CSInterface)
                 ▼                              ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  Backend (backend/)          │   │  Integração Premiere (host/) │
│  Node.js puro (sem deps)     │   │  ExtendScript (JSX)          │
│  yt-dlp, ffmpeg, cache,      │   │  importa arquivos, cria bin, │
│  downloads, progresso        │   │  insere clipe no playhead    │
└─────────────────────────────┘   └─────────────────────────────┘
```

- **Frontend → Backend**: o CEP permite habilitar Node.js diretamente dentro
  do próprio processo do painel (`--enable-nodejs` + `--mixed-context` no
  `CSXS/manifest.xml`). Isso significa que o JavaScript do painel pode chamar
  `require('child_process')`, `fs`, `path`, `crypto` etc. **diretamente**,
  sem precisar de um servidor HTTP/socket separado. É essa camada que chama o
  `yt-dlp` e o `ffmpeg` como processos filhos reais.
- **Frontend → Premiere**: toda operação que toca o projeto do Premiere
  (`app.project`, `app.project.activeSequence`, inserir clipe na timeline)
  passa pelo `CSInterface.evalScript()`, que executa funções ExtendScript
  definidas em `host/index.jsx`. Essa é a única forma suportada de manipular
  o projeto a partir de uma extensão.
- **Sem dependências de npm em tempo de execução**: o backend usa apenas
  módulos nativos do Node (`child_process`, `fs`, `path`, `os`, `crypto`).
  Isso evita a necessidade de `npm install` dentro da extensão instalada.

O download/corte é feito com **yt-dlp** (`--download-sections`, que baixa
somente o trecho pedido usando FFmpeg internamente para localizar keyframes) e
o **FFmpeg** garante compatibilidade final com o Premiere (remux rápido para
`.mp4` H.264/AAC quando possível, ou transcodifica quando o material original
vem em VP9/Opus).

---

## Requisitos

- **Adobe Premiere Pro** (versão atual — 2023/2024/2025, CEP 9 ou superior).
- **macOS** (foco principal) ou **Windows 10/11**.
- **yt-dlp** instalado no sistema.
- **FFmpeg** instalado no sistema.
- Conexão com a internet (para baixar vídeos e, opcionalmente, exibir a
  prévia embutida do YouTube).

## Instalação do yt-dlp

**macOS (Homebrew — recomendado):**

```bash
brew install yt-dlp
```

**Windows (winget):**

```powershell
winget install --id yt-dlp.yt-dlp -e
```

**Alternativa (qualquer plataforma, via pip):**

```bash
python3 -m pip install -U yt-dlp
```

Verifique a instalação:

```bash
yt-dlp --version
```

## Instalação do FFmpeg

**macOS (Homebrew):**

```bash
brew install ffmpeg
```

**Windows (winget):**

```powershell
winget install --id Gyan.FFmpeg -e
```

Verifique a instalação:

```bash
ffmpeg -version
```

> A extensão detecta `yt-dlp` e `ffmpeg` automaticamente no PATH e em locais
> comuns de instalação (Homebrew, WinGet, Scoop). Se a detecção automática
> falhar, informe o caminho completo do executável na aba
> **⚙ Configurações** do painel.

## Instalação da extensão no Premiere

### Passo 1 — Copiar a extensão

Use o instalador do seu sistema (copia os arquivos para a pasta de extensões
CEP do usuário e habilita o modo de debug, necessário porque esta extensão
não está assinada com um certificado Adobe):

**macOS:**

```bash
bash install/install-mac.sh
```

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File install\install-win.ps1
```

Os scripts também detectam se `yt-dlp`/`ffmpeg` estão ausentes e oferecem
instalá-los via Homebrew/winget.

### Passo 2 — Instalação manual (alternativa)

Se preferir copiar manualmente, coloque **todo** o conteúdo desta pasta
(exceto `install/`) em:

- macOS: `~/Library/Application Support/Adobe/CEP/extensions/com.kvnlibrary.youtubeimporter/`
- Windows: `%APPDATA%\Adobe\CEP\extensions\com.kvnlibrary.youtubeimporter\`

E habilite o modo de debug do CEP (necessário para extensões não assinadas):

- macOS, no Terminal: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1`
- Windows, no Registro: crie/edite `HKEY_CURRENT_USER\Software\Adobe\CSXS.11`
  com o valor de string `PlayerDebugMode = 1`

(repita para as versões `CSXS.9`, `CSXS.10` e `CSXS.12` se o seu Premiere for
mais antigo ou mais novo — os scripts de instalação já fazem isso
automaticamente).

### Passo 3 — Abrir o painel

1. Feche e reabra o Adobe Premiere Pro.
2. Abra um projeto (é necessário ter um projeto aberto).
3. Vá em **Window (Janela) → Extensions (Extensões) → YouTube Importer**.

> **Atalho de teclado para abrir o painel:** o Premiere Pro não expõe uma API
> pública para uma extensão registrar seu próprio atalho de teclado global —
> isso só pode ser feito pelo usuário em **Edit → Keyboard Shortcuts** (se a
> sua versão do Premiere permitir atribuir um atalho a itens do menu
> Window/Extensions). É uma limitação da plataforma, não da extensão.

---

## Como usar

### Importar um vídeo

1. Copie a URL do vídeo no YouTube (`youtube.com/watch?v=...`, `youtu.be/...`
   ou com parâmetros extras — todos são aceitos).
2. Cole no campo **"Cole a URL do YouTube..."** e clique em **Carregar** (ou
   arraste o link diretamente para dentro do painel).
3. O painel mostra miniatura, título, canal, duração e (quando possível) uma
   prévia reproduzível do vídeo.

### Selecionar o trecho

Na seção **Selecionar trecho**:

- Digite o **Início** e o **Fim** no formato `HH:MM:SS` (ou `MM:SS`).
- Ou use os botões **Definir início atual** / **Definir fim atual** enquanto
  reproduz a prévia — eles capturam a posição atual do player.
- O painel calcula e mostra **"Trecho selecionado: HH:MM:SS"** e valida
  automaticamente: início não pode ser maior/igual ao fim, e nenhum dos dois
  pode ultrapassar a duração do vídeo.

### Escolher tipo de mídia e qualidade

- **Vídeo + Áudio**, **Somente Vídeo** ou **Somente Áudio**.
- Qualidade: **Melhor disponível**, **1080p**, **720p**, **480p** ou
  **Áudio — melhor qualidade**. Se a qualidade escolhida não existir para
  aquele vídeo, a extensão usa automaticamente a melhor qualidade disponível
  abaixo dela e avisa você durante o processamento.

### Importar

- **Importar para Projeto**: baixa apenas o trecho pedido, converte para um
  formato compatível com o Premiere e adiciona o arquivo ao bin
  **"YouTube Imports"** dentro do Project Panel (o nome do bin pode ser
  alterado em Configurações).
- **Enviar para Timeline**: faz tudo o que o botão acima faz e, em seguida,
  insere o clipe na sequência atualmente aberta, na posição atual do
  playhead. Se não houver nenhuma sequência aberta, o painel avisa
  claramente que é necessário abrir/criar uma sequência (o clipe continua
  disponível no Project Panel normalmente).

Durante o processo você acompanha o progresso em tempo real:
`Obtendo informações...` → `Baixando... 43%` (com tamanho, velocidade e ETA)
→ `Processando vídeo...` → `Importando para Premiere...` → `Concluído`.
É possível **cancelar** a qualquer momento pelo botão **Cancelar**.

### Cache de trechos já baixados

Se você pedir exatamente o mesmo vídeo + trecho + tipo de mídia + qualidade
outra vez, o painel pergunta:
*"Este trecho já foi importado. Deseja reutilizá-lo?"* com as opções
**Usar existente** (reaproveita o arquivo, instantâneo) ou
**Baixar novamente**.

### Histórico, favoritos e lote

- Aba **Histórico**: mostra os últimos vídeos importados e permite reabri-los
  rapidamente; também lista vídeos favoritados (botão ☆ na tela de
  importação).
- **Importação em lote**: no rodapé da aba Importar, cole uma URL por linha e
  clique em **Processar lista** para importar vários vídeos inteiros em
  sequência (usa o tipo de mídia/qualidade selecionados) direto para o bin do
  projeto.

---

## Configurações avançadas

Na aba **⚙ Configurações**:

- **Pasta de downloads** — onde os arquivos finais (e os temporários,
  removidos automaticamente ao final) são salvos. Padrão:
  `~/Movies/Premiere YouTube Imports` (macOS) ou
  `%USERPROFILE%\Videos\Premiere YouTube Imports` (Windows).
- **Nome do bin no projeto** — padrão `YouTube Imports`.
- **Caminhos personalizados de yt-dlp/ffmpeg** — use se a detecção
  automática não encontrar os executáveis.
- **Cache** e **limpeza automática de arquivos temporários** — ligar/desligar.
- **Status das dependências** — mostra se `yt-dlp`/`ffmpeg` foram encontrados
  e o caminho usado.

---

## Solução de problemas

### Vendo o erro real (console de depuração)

Como o painel roda dentro do Premiere, ele não tem um DevTools visível por
padrão — mas o arquivo `.debug` na raiz do projeto já habilita a depuração
remota via Chrome. Se algum botão parecer não fazer nada, ou uma tela ficar
em branco:

1. Com o Premiere aberto e o painel **YouTube Importer** visível, abra o
   **Google Chrome** (precisa estar instalado) e acesse:
   `http://localhost:8090`
2. Clique no link da extensão que aparecer na lista — isso abre o DevTools
   do Chrome conectado ao painel.
3. Vá na aba **Console** e veja a mensagem de erro em vermelho.
4. Se quiser reportar o problema, copie o texto completo do erro.

A partir da atualização mais recente, a maioria dos erros internos também
aparece diretamente na tela do painel (na linha de status abaixo do campo de
URL), então normalmente você já vai ver uma pista sem precisar abrir o
Chrome — mas o DevTools continua sendo a forma mais completa de investigar.

| Sintoma | O que fazer |
|---|---|
| "yt-dlp não foi encontrado" | Instale o yt-dlp (veja acima) ou informe o caminho manualmente em Configurações. |
| "FFmpeg não foi encontrado" | Instale o FFmpeg (veja acima) ou informe o caminho manualmente em Configurações. |
| "URL inválida" | Confirme que é um link de vídeo único do YouTube (`watch?v=`, `youtu.be/`, `/shorts/`). Playlists inteiras não são suportadas — cole o link do vídeo específico. |
| "Este vídeo é privado / foi removido / não está disponível" | O vídeo não pode ser baixado por restrição do próprio YouTube; não há como contornar isso. |
| "A conexão com a internet foi perdida" | Verifique sua rede e tente novamente; o cache evita ter que rebaixar trechos já concluídos. |
| "Não há espaço suficiente em disco" | Libere espaço na pasta de downloads configurada ou aponte para outro volume em Configurações. |
| "Não há nenhuma sequência aberta" | Abra ou crie uma sequência no Premiere antes de clicar em "Enviar para Timeline". O arquivo já foi importado para o Project Panel normalmente. |
| O painel não aparece no menu Window → Extensions | Confirme que rodou o instalador (ou habilitou `PlayerDebugMode`) e reinicie o Premiere completamente. |
| A prévia do YouTube não carrega | Requer acesso à internet a partir do painel; os campos de início/fim continuam funcionando manualmente mesmo sem a prévia. |
| Áudio não fica sincronizado ao vídeo na timeline | Confirme que o clipe foi baixado como "Vídeo + Áudio" — o Premiere posiciona o áudio vinculado automaticamente ao inserir na faixa de vídeo; se a faixa de áudio correspondente estiver bloqueada/desabilitada, desbloqueie-a antes de importar. |

Todos os erros técnicos (código de saída de processo, stack trace etc.) são
traduzidos para mensagens compreensíveis antes de chegar à interface — se
você ver algo como "Process exited with code 1" diretamente na tela, isso é
um bug e deve ser reportado.

---

## Limitações conhecidas

- **Atalho de teclado para abrir o painel**: não há API pública do Premiere
  para uma extensão registrar isso sozinha (ver seção de instalação acima).
- **Prévia interativa**: usa a YouTube IFrame Player API, que exige acesso à
  internet dentro do painel. Sem conexão, a prévia é ocultada mas a seleção
  manual de início/fim continua funcionando normalmente.
- **Detecção de binários**: `yt-dlp`/`ffmpeg` precisam estar instalados no
  sistema (não são distribuídos junto da extensão) — isso mantém o pacote
  pequeno e sempre atualizado com a versão mais recente dessas ferramentas,
  que mudam com frequência para acompanhar o YouTube.
- **Windows**: a arquitetura (CEP + Node.js + ExtendScript) é totalmente
  multiplataforma e os caminhos de detecção de binários/pastas padrão já
  contemplam Windows, mas o desenvolvimento e testes principais foram feitos
  visando macOS, conforme solicitado.

---

## Estrutura do projeto

```
YouTubeImporter/
├── CSXS/
│   └── manifest.xml          # Manifesto da extensão CEP
├── .debug                    # Configuração de debug remoto (Chrome DevTools)
├── icons/                    # Ícones do painel (normal/rollover/disabled/dark)
├── client/                   # Frontend — painel dentro do Premiere
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── csinterface.js        # Ponte oficial CEP <-> host
│       ├── host-bridge.js        # Chamadas para host/index.jsx
│       ├── backend-bridge.js     # Chamadas para os módulos em backend/
│       ├── time-utils.js
│       ├── youtube-preview.js    # Player de prévia (YouTube IFrame API)
│       ├── video-loader.js       # Campo de URL + card de informações
│       ├── trim-selector.js      # Seleção de trecho
│       ├── import-controller.js  # Orquestra download -> import -> timeline
│       ├── history-panel.js
│       ├── settings-panel.js
│       ├── batch-panel.js
│       └── app.js                # Bootstrap / abas
├── backend/                  # Node.js puro (roda dentro do próprio painel)
│   ├── ytdlp.js               # Wrapper do yt-dlp (metadados + download)
│   ├── ffmpeg.js              # Wrapper do ffmpeg (compatibilidade/áudio)
│   ├── downloadManager.js     # Orquestra todo o pipeline + progresso
│   ├── binaries.js            # Localização de yt-dlp/ffmpeg no sistema
│   ├── cache.js                # Índice de trechos já baixados
│   ├── history.js              # Histórico e favoritos
│   ├── config.js               # Configurações persistidas
│   ├── fsUtils.js              # Nomes de arquivo, espaço em disco, etc.
│   └── errors.js               # Tradução de erros técnicos -> mensagens claras
├── host/
│   └── index.jsx              # ExtendScript: importFiles, bins, timeline
└── install/
    ├── install-mac.sh
    └── install-win.ps1
```
