# ProShow

Software de projeção para eventos ao vivo — letras, Bíblia, mídia, câmera e
web, com temas tipográficos, composição artística e avanço automático por
voz (no dispositivo). Desktop (Electron): macOS, Windows e Linux.

![Console do operador — Show com Preview e Programa](docs/img/operador.png)

---

## Manual completo

O guia detalhado (fluxo, cada painel, atalhos, Auto, Temas, Saídas, persistência)
está em:

**→ [docs/FEATURES.md](docs/FEATURES.md)** — *Manual do operador*

As imagens do manual são capturas reais do app.

---

## Índice rápido

| Quero… | Ir para |
|---|---|
| Manual completo | [docs/FEATURES.md](docs/FEATURES.md) |
| Instalar / build | [docs/BUILD.md](docs/BUILD.md) |
| Rodar do código | [Começando](#começando) |
| Fluxo em 30 s | [Como funciona](#como-funciona) |
| OBS / NDI | [Transmissão](#transmissão) |
| Ajuda | [Suporte](#suporte-e-comunidade) |

---

## Começando

Requer **Node 22+**.

```bash
git clone https://github.com/davigodoy/proshow.git
cd proshow/prototypes/electron-shell
npm install
npm run dev
```

Abre o **Operador**. Sem segundo monitor, a saída roda em **simulação**
dentro do console (Preview + Programa).

Instaladores: [docs/BUILD.md](docs/BUILD.md) ·
[Releases](https://github.com/davigodoy/proshow/releases).

---

## Como funciona

Nada vai ao projetor sozinho:

**Biblioteca → Plano → Preview (mudo) → Enviar ao vivo → Programa (com som)**

![Fluxo no console](docs/img/fluxo-operador.png)

| Peça | Função |
|---|---|
| Biblioteca | Letras, Bíblia, mídia |
| Plano | Ordem do culto (persiste entre sessões) |
| Preview | Ensaio silencioso (tema/fundo de áudio só vão ao ar no Enviar) |
| Programa | Ao vivo — projetor / OBS / NDI |

Áudio (MP3/…): arte do tema ou mídia de fundo atrás da faixa; espectro em
tela cheia se a posição for **Fundo**. Detalhes no
[manual §7 e §12](docs/FEATURES.md#7-biblioteca--mídia-e-web).

Abas: **Show** · **Temas** · **Saídas**.

Atalhos essenciais: **Enter/Espaço** envia e arma a próxima · **B** black ·
**Ctrl+Tab** cicla Letras/Bíblia/Mídia. Lista completa no
[manual](docs/FEATURES.md#3-atalhos-de-teclado).

### Recortes do console

| Área | Captura |
|---|---|
| Bíblia | ![Bíblia](docs/img/biblia.png) |
| Mídia | ![Mídia](docs/img/midia.png) |
| Editor de seções | ![Editor](docs/img/editor-secoes.png) |
| Criativo | ![Criativo](docs/img/criativo.png) |
| Auto | ![Auto](docs/img/auto-avanco.png) |
| Temas | ![Temas](docs/img/temas.png) |
| Saídas | ![Saídas](docs/img/saidas.png) |
| Espectro | ![Espectro](docs/img/espectro.png) |

---

## Transmissão

| URL | Uso |
|---|---|
| `http://localhost:8787/overlay` | Browser Source no OBS |
| `http://localhost:8787/live.json` | Estado em JSON |

NDI: aba **Saídas**. Detalhes no [manual §14](docs/FEATURES.md#14-aba-saídas).

---

## Suporte e comunidade

**→ [Grupo no WhatsApp](https://chat.whatsapp.com/FuRNwnNQiSf1wOkpplcqEu?mode=gi_t)**

[Issues](https://github.com/davigodoy/proshow/issues)

---

## Estado do projeto

Em uso real; desenvolvimento ativo. Validação intensa no **macOS**.
Windows/Linux: [BUILD.md](docs/BUILD.md). Bíblia: arquivos em `data/bible/`
(não vêm no repo por copyright).

## Stack

Electron 43 · TypeScript · React 19 · Vite 8 · Vosk (Auto) · RNNoise (Isolar voz)

## Licença

Ainda não definida — direitos reservados.
