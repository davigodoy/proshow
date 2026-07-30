# Build — ProShow

Como rodar o ProShow a partir do código, e como gerar o aplicativo instalável.

- **Nunca usou terminal?** Comece pelo [Passo a passo](#passo-a-passo-do-zero).
- **Já é desenvolvedor?** Pule para [Referência rápida](#referência-rápida).

---

## Passo a passo (do zero)

### 1. Instalar o Node.js

O ProShow precisa do **Node.js 20 ou superior**. Para conferir se você já tem,
abra o terminal e digite:

```bash
node --version
```

> **Como abrir o terminal:** no macOS, `Cmd + Espaço`, digite "Terminal".
> No Windows, tecla Windows e digite "PowerShell". No Linux, `Ctrl + Alt + T`.

Se aparecer algo como `v20.11.0` ou maior, pode seguir. Se der "command not
found" ou a versão for menor que 20, instale:

| Sistema | Como instalar |
|---|---|
| **macOS** | Baixe o instalador LTS em [nodejs.org](https://nodejs.org) — ou, com Homebrew: `brew install node` |
| **Windows** | Baixe o instalador LTS em [nodejs.org](https://nodejs.org) e siga o assistente |
| **Linux** | `sudo apt install nodejs npm` (Debian/Ubuntu) — se a versão vier antiga, use o [NodeSource](https://github.com/nodesource/distributions) |

Depois de instalar, **feche e reabra o terminal** e rode `node --version` de
novo para confirmar.

### 2. Baixar o código

```bash
git clone https://github.com/davigodoy/proshow.git
cd proshow/prototypes/electron-shell
```

> Se `git` não estiver instalado, você também pode baixar o ZIP pelo botão
> verde **Code → Download ZIP** na página do projeto, descompactar, e entrar
> na pasta `prototypes/electron-shell`.

O código do aplicativo fica em `prototypes/electron-shell` — **todos os
comandos daqui em diante rodam dentro dessa pasta**.

### 3. Instalar as dependências

```bash
npm install
```

Demora alguns minutos na primeira vez (baixa o Electron, que é grande). É
normal aparecerem avisos de `vulnerabilities` no fim; não impedem o uso.

### 4. Rodar

```bash
npm run dev
```

Abrem duas janelas: o **console do operador** e a **saída** (o que vai para o
projetor). Sem um segundo monitor conectado, a saída roda em modo simulação,
dentro da própria tela.

Para parar, volte ao terminal e pressione `Ctrl + C`.

### 5. Gerar o aplicativo instalável

Só é necessário se você quiser um app que abre com duplo clique, sem terminal.
Rode o comando do **seu** sistema:

```bash
npm run pack:mac     # macOS com chip Apple (M1/M2/M3/M4)
npm run pack:mac:x64 # macOS com chip Intel
npm run pack:win     # Windows
npm run pack:linux   # Linux
```

> **Mac: qual é o meu chip?** Menu  → *Sobre este Mac*. Se disser "Apple M…",
> use `pack:mac`. Se disser "Intel", use `pack:mac:x64`.

O resultado aparece na pasta `release/`:

| Sistema | Onde fica | O que fazer |
|---|---|---|
| macOS | `release/mac-arm64/ProShow.app` | Arraste para a pasta *Aplicativos* |
| Windows | `release/ProShow Setup ….exe` | Execute o instalador |
| Linux | `release/ProShow-….AppImage` ou `.deb` | `chmod +x` no AppImage, ou instale o `.deb` |

**No macOS, na primeira abertura** o sistema pode avisar que o desenvolvedor
não está identificado — o release público usa assinatura **ad-hoc**, não
notarização da Apple. Clique com o botão direito → **Abrir**, ou em
*Ajustes → Privacidade e Segurança* → **Abrir mesmo assim**.

Se aparecer *“danificado… mover para o Lixo”* (raro após o v0.1.4+), no
Terminal:

```bash
xattr -cr /caminho/para/ProShow.app
```

---

## Referência rápida

Todos dentro de `prototypes/electron-shell`:

| Comando | O que faz |
|---|---|
| `npm run dev` | Vite + Electron com hot reload |
| `npm run dev:web` | só o Vite no navegador (sem câmera/NDI/IPC nativo) |
| `npm test` | suíte de testes (Node `--test`, sem DOM) |
| `npx tsc -b` | checagem de tipos |
| `npm run build` | compila a interface para `dist/` |
| `npm run pack:mac` / `:mac:x64` / `pack:win` / `pack:linux` | empacota o app (já chama o build) |

Os testes **não** rodam automaticamente no empacotamento — rode `npm test`
antes de gerar uma versão para uso real.

---

## ⚠️ Build cruzado (cross-compile) — não confiar

`electron-builder` aceita gerar pacote de outro sistema (ex.: Windows a partir
do Mac), mas este projeto tem **dependências nativas**:

- `@napi-rs/canvas` — medição de texto sem DOM
- `grandi` — SDK de NDI
- `@ffprobe-installer/ffprobe` — binário do ffprobe

Elas instalam o binário do sistema **em que `npm install` rodou**. Gerar um
instalador Windows a partir do Mac empacota binários do Mac lá dentro: o build
"termina com sucesso" e o app quebra só ao ser aberto — sem erro no build,
o que torna a falha difícil de diagnosticar.

**Regra: gere o pacote no mesmo sistema em que ele vai rodar.** Windows precisa
de máquina ou VM Windows; Linux, de máquina/VM/container Linux.

### Para lançar as três plataformas: CI

O repositório inclui o workflow
[`.github/workflows/release.yml`](../.github/workflows/release.yml):

- **Tag `v*`** (ex.: `v0.1.2`) — builda macOS (arm64), Windows e Linux em
  runners nativos e publica a Release no GitHub com os artefatos.
- **Actions → Release → Run workflow** — dry-run: builda e sobe artifacts
  sem criar Release.

Cada SO resolve as dependências nativas (`@napi-rs/canvas`, NDI, ffprobe) no
próprio runner — por isso não se faz build cruzado na máquina de
desenvolvimento.

Localmente, use só o `pack:` do **seu** sistema (`pack:mac`, `pack:win`,
`pack:linux`).

---

## Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| `command not found: node` | Node não instalado, ou terminal não reiniciado após instalar — veja o passo 1 |
| `Cannot find module` ao rodar | Faltou `npm install`, ou você está na pasta errada (tem que ser `prototypes/electron-shell`) |
| Erro de tipo em `@huggingface/transformers` | `npm install` incompleto — rode de novo |
| App empacotado abre sem NDI ou sem câmera | Provável build cruzado — veja a seção acima |
| macOS diz "aplicativo danificado" ou "desenvolvedor não identificado" | App não assinado; libere em *Privacidade e Segurança* (passo 5) |

Travou em algo que não está aqui? Pergunte no
**[grupo de suporte no WhatsApp](https://chat.whatsapp.com/FuRNwnNQiSf1wOkpplcqEu?mode=gi_t)**.

## Mais sobre o app

- [`README.md`](../README.md) — visão geral e telas
- [`docs/FEATURES.md`](FEATURES.md) — detalhe técnico de cada funcionalidade
