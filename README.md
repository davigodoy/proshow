# ProShow

Software de projeção para eventos ao vivo — letras, Bíblia, mídia, câmera e
web, com temas tipográficos editáveis e um modo de composição artística.
Desktop (Electron), para macOS, Windows e Linux.

![Console do operador](docs/img/operador.png)

---

## Índice

| Quero… | Ir para |
|---|---|
| Ver o que o app faz | [Recursos](#recursos) · [detalhe técnico](docs/FEATURES.md) |
| Rodar na minha máquina | [Começando](#começando) |
| Gerar o instalador | [docs/BUILD.md](docs/BUILD.md) |
| Entender a tela do operador | [Como funciona](#como-funciona) |
| Transmitir (OBS / NDI) | [Transmissão](#transmissão) |
| Pedir ajuda ou sugerir melhoria | [Suporte e comunidade](#suporte-e-comunidade) |
| Saber o que falta / limitações | [Estado do projeto](#estado-do-projeto) |

---

## Começando

Requer **Node 20+**.

```bash
git clone https://github.com/davigodoy/proshow.git
cd proshow/prototypes/electron-shell
npm install
npm run dev
```

Abre duas janelas: o **console do operador** e a **saída** (o que é
projetado). Sem segundo monitor, a saída roda em modo simulação, dentro da
própria tela do operador.

Para gerar `.app` (macOS), instalador `.exe` (Windows) ou `AppImage`/`.deb`
(Linux), veja **[docs/BUILD.md](docs/BUILD.md)** — inclui o motivo de o build
precisar rodar em cada sistema operacional, e não cruzado.

---

## Como funciona

O fluxo é o de uma mesa de corte: você **prepara** no Preview e **manda ao
ar** no Programa. Nada vai para o projetor sem o seu comando.

```
Biblioteca  →  Plano do show   →  PREVIEW  →  [ENVIAR AO VIVO]  →  PROGRAMA
 letras                            prepara                          projetor
 bíblia                            aqui                             OBS / NDI
 mídia
```

Três abas no console:

- **Show** — biblioteca, plano do show, preview/programa, gates de exibição
- **Temas** — editor visual de tipografia e layout (abaixo)
- **Saídas** — monitores, margem de projeção, overlay, NDI

### Temas: o que você vê é o que projeta

![Editor de temas](docs/img/temas.png)

O editor mostra a proporção real da saída. Título e letra são arrastados
independentemente; a **margem da saída** (laranja) é o limite físico da
projeção, e a **área do texto** (tracejada) recorta dentro dela.

Tamanho da letra em dois modos: **fixo** (o tema manda, e o texto que não
couber vira slide novo) ou **preencher** (cresce até o limite da área). O
texto nunca encolhe até ficar ilegível.

### Criativo: a frase como peça gráfica

![Modo criativo na saída](docs/img/saida-criativo.png)

Uma frase por vez, com layout sorteado (bloco central, coluna, cascata,
carimbo). O tamanho é calculado simulando a quebra dentro da região — a maior
fonte que cabe — e a composição varia a cada exibição, sem repetir. O modo
**Max** empilha até 3 frases em mosaico.

---

## Recursos

**Conteúdo** — letras (biblioteca + busca online, editor com seções
verso/refrão/…, sempre revisada antes de salvar) · Bíblia em várias versões,
com passagens longas divididas em partes navegáveis · vídeo, imagem, PDF e
apresentações · página web com recorte de área · câmera ao vivo com
isolamento de voz local.

**Temas** — canvas WYSIWYG, fontes do Google e locais, controle completo de
tipografia, margem de projeção única que tudo respeita.

**Criativo** — composição artística da frase, com famílias de layout,
palavra-chave em destaque e variação por semente.

**Saída** — múltiplos monitores, modo *span* (2 projetores como uma tela),
overlay HTTP para OBS, saída NDI, analisador de espectro (barra inferior
automática em câmera/mídia ao vivo).

**Operação** — Preview sem áudio; Programa com som. Atalhos de teclado para
todo o fluxo ao vivo. Avanço automático por detecção de fala está
**previsto, ainda não neste repositório público** (ver
[Estado do projeto](#estado-do-projeto)).

→ Detalhe técnico de cada item: **[docs/FEATURES.md](docs/FEATURES.md)**

---

## Transmissão

Com o app rodando, um servidor HTTP local expõe:

| Endereço | Uso |
|---|---|
| `http://localhost:8787/overlay` | **Browser Source** no OBS — mostra o texto que está na tela |
| `http://localhost:8787/live.json` | mesmo estado em JSON, para integrações próprias |

O overlay mostra exatamente a parte do texto que está projetada — se a
passagem foi dividida, ele acompanha a divisão.

Para **NDI**, ligue a saída NDI na aba *Saídas*; a projeção aparece como
fonte na rede para vMix, OBS com plugin NDI e afins.

---

## Suporte e comunidade

Dúvida de instalação, problema durante um evento, ideia de melhoria ou quer
acompanhar o que está sendo desenvolvido:

**→ [Grupo de suporte no WhatsApp](https://chat.whatsapp.com/FuRNwnNQiSf1wOkpplcqEu?mode=gi_t)**

Bugs e pedidos de funcionalidade também podem ir para as
[Issues](https://github.com/davigodoy/proshow/issues) — o que for reportado
por lá fica registrado e rastreável.

---

## Estado do projeto

Em uso real, mas ainda em desenvolvimento ativo. O que você deve saber antes
de adotar:

- **Testado a fundo no macOS.** Windows e Linux compilam pela mesma base, mas
  não passaram pelo mesmo uso ao vivo — veja a ressalva de dependências
  nativas em [docs/BUILD.md](docs/BUILD.md).
- **Bíblia não acompanha o repositório.** As traduções têm copyright próprio;
  o app lê os arquivos de `data/bible/`, que você fornece. Veja
  [`data/bible/README.md`](prototypes/electron-shell/data/bible/README.md).
- **Avanço automático por voz ainda não está neste repositório.** É um item
  previsto (transcrição local + match com o plano); só será publicado quando
  estiver validado ao vivo. Hoje o avanço é teclado / clique.
- **O plano do show ainda não persiste em disco** entre sessões.

## Stack

Electron 43 · TypeScript · React 19 · Vite 8. Uma aplicação React, duas
janelas Electron (Operador e Saída) e um servidor HTTP local.

## Licença

Ainda não definida. Até que uma licença seja escolhida, todos os direitos
são reservados — o código está visível, mas sem permissão de uso ou
redistribuição.
