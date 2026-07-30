# ProShow

Software de projeção para eventos ao vivo — letras, Bíblia, mídia, câmera e
web, com temas tipográficos, composição artística e avanço automático por
voz (no dispositivo). Desktop (Electron): macOS, Windows e Linux.

![Console do operador](docs/img/operador.png)

---

## Índice

| Quero… | Ir para |
|---|---|
| Entender o fluxo | [Como funciona](#como-funciona) |
| Ver cada recurso | [Recursos](#recursos) · [guia completo](docs/FEATURES.md) |
| Rodar na máquina | [Começando](#começando) |
| Gerar instalador | [docs/BUILD.md](docs/BUILD.md) |
| OBS / NDI | [Transmissão](#transmissão) |
| Ajuda | [Suporte](#suporte-e-comunidade) |
| Limitações | [Estado do projeto](#estado-do-projeto) |

---

## Começando

Requer **Node 22+** (a suíte de testes usa flags do Node 22).

```bash
git clone https://github.com/davigodoy/proshow.git
cd proshow/prototypes/electron-shell
npm install
npm run dev
```

Abre o **Operador** e a **Saída**. Sem segundo monitor, a saída roda em
simulação dentro do próprio console.

Instaladores (`.app` / `.exe` / AppImage): ver
**[docs/BUILD.md](docs/BUILD.md)** — build em cada SO, sem cruzar binários
nativos. Releases oficiais:
[github.com/davigodoy/proshow/releases](https://github.com/davigodoy/proshow/releases).

---

## Como funciona

![Fluxo do operador](docs/img/fluxo-operador.png)

Mesa de corte: **prepara** no Preview, **manda ao ar** no Programa. Nada
vai ao projetor sozinho.

```
Biblioteca  →  Plano   →  PREVIEW  →  enviar  →  PROGRAMA
 letras                     (mudo)                projetor / OBS / NDI
 bíblia · mídia
```

- **Show** — biblioteca, plano, preview/programa, Auto, espectro
- **Temas** — tipografia e layout WYSIWYG
- **Saídas** — monitores, margem, overlay, NDI

### Temas

![Editor de temas](docs/img/temas.png)

Proporção real da saída. Título e letra arrastáveis. Margem laranja =
limite físico; área tracejada = texto. Modos **fixo** (slide novo se não
couber) e **preencher** (cresce até o limite) — a letra não vira miúda.

### Criativo

![Modo criativo](docs/img/saida-criativo.png)

Frase como peça gráfica: layouts sorteados, Max com mosaico de até 3
frases, variação por semente.

### Editor de seções

![Editor verso / refrão](docs/img/editor-secoes.png)

Organize Verso, Refrão, Coro, Pré-coro e Ponte; arraste linhas; desfazer;
busca enquanto digita o título.

### Auto (voz)

![Auto no plano](docs/img/auto-avanco.png)

Escuta a entrada, transcreve no Mac (Vosk) e avança o plano quando a linha
bate — sem nuvem. Detalhes em [FEATURES.md](docs/FEATURES.md#auto--avanço-por-voz).

---

## Recursos

**Conteúdo** — letras (biblioteca + online + editor de seções) · Bíblia ·
vídeo/áudio/imagem/PDF/deck · web com crop · câmera com Isolar voz.

**Temas** — canvas fiel à saída, Google Fonts / locais, margem única.

**Criativo** — composição artística Solo / Max.

**Auto** — avanço por voz on-device (Vosk + grammar do plano).

**Saída** — multi-monitor, span, overlay HTTP, NDI, espectro (HUD automático
em câmera/mídia ao vivo).

**Operação** — Preview sem som; Programa com som; atalhos de culto.

→ Guia seção a seção: **[docs/FEATURES.md](docs/FEATURES.md)**

---

## Transmissão

| Endereço | Uso |
|---|---|
| `http://localhost:8787/overlay` | Browser Source no OBS |
| `http://localhost:8787/live.json` | Estado em JSON |

NDI: aba *Saídas*. Espectro em barra inferior sobre câmera/mídia:

![Espectro HUD](docs/img/espectro-hud.png)

---

## Suporte e comunidade

**→ [Grupo no WhatsApp](https://chat.whatsapp.com/FuRNwnNQiSf1wOkpplcqEu?mode=gi_t)**

Bugs e ideias também nas
[Issues](https://github.com/davigodoy/proshow/issues).

---

## Estado do projeto

Em uso real; desenvolvimento ativo.

- Validação intensa no **macOS**. Windows/Linux: ver
  [BUILD.md](docs/BUILD.md) (deps nativas).
- Bíblia: você coloca os arquivos em `data/bible/` (ver README lá).
- Plano do show ainda **não** persiste entre sessões.
- Auto por voz está **neste repositório**; use com critério no culto.

## Stack

Electron 43 · TypeScript · React 19 · Vite 8 · Vosk (browser) para o Auto ·
RNNoise para Isolar voz.

## Licença

Ainda não definida. Até lá, direitos reservados — código visível, sem
licença de uso/redistribuição.
