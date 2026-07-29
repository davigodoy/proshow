# Funcionalidades — ProShow

Referência técnica do que o app faz. Duas janelas Electron — **Operador**
(console de controle) e **Saída** (o que é projetado) — mais um servidor
HTTP local para integrações externas.

---

## Conteúdo

### Letras
Biblioteca local de músicas. Busca online integrada (chave de API própria,
configurada pelo operador) — resultado sempre cai no editor pra revisão
antes de salvar, nunca vai direto ao ar.

**Editor de letra** — fluxo contínuo (tipo bloco de texto), com organização
em seções: Verso, Refrão, Coro, Pré-coro, Ponte. Arraste linhas (alça) até
uma tag ou até um bloco existente; Shift+setas selecionam; Delete remove a
seleção. Desfazer/refazer na barra de tags. Sugestão enquanto digita o
título (biblioteca + online). Tema padrão da música e confirmação ao fechar
com alterações não salvas.

Edição de estilo por frase (tamanho, cor, fonte, animação) com opção de
salvar como padrão da música.

### Bíblia
Múltiplas versões. Passagens longas são divididas automaticamente em
partes navegáveis por seta/Enter — sem encolher a fonte pra caber tudo de
uma vez.

### Mídia
Vídeo, imagem, PDF e apresentação (deck) com transporte (play/pause/loop) e
navegação por página/slide.

### Web
Página externa como fonte de projeção, com recorte de área (crop) pra
mostrar só a região relevante da página.

### Câmera
Câmera ao vivo como fonte, com isolamento de voz opcional — redução de
ruído via RNNoise, processada localmente (worklet de áudio), sem envio a
serviço externo.

---

## Temas

Editor visual (canvas) com posicionamento por arrasto: título e letra têm
handles independentes, e o que aparece no editor é exatamente o que vai
para a saída (mesma base de medição usada nos dois lugares).

Campos: fonte (Google Fonts com import local, ou fonte do sistema),
tamanho, peso, cor, espaçamento de letra, altura de linha, alinhamento,
âncora vertical, offset e rotação — separados para título e letra.

**Tamanho de texto — dois modos:**
- **Fixo**: tamanho exato do tema, em `vw` (proporcional à largura da
  saída). Texto que não cabe na área é repartido automaticamente em um
  slide adicional, com reticências na emenda — nunca encolhe.
- **Preencher**: cresce até o maior tamanho que cabe na área do tema.

**Margem de saída**: limite físico único da projeção. Todo o resto — tema,
letra, título, mídia, câmera — recorta *dentro* dessa margem, nunca fora
dela. A geometria é um `clip-path`, não só uma caixa de layout: cobre o que
sai da área, incluindo fundo/vídeo/câmera. Pensado para permitir formas de
recorte além do retângulo (projeção mapeada) sem mudar o resto do pipeline.

---

## Criativo (composição artística)

Modo de exibição onde a frase é tratada como peça gráfica, não como texto
corrido.

- **Solo**: uma frase por vez, layout sorteado entre famílias (bloco
  central, coluna, cascata diagonal, carimbo rotacionado). O tamanho da
  fonte é resolvido simulando a quebra de linha dentro da região do layout
  — a maior fonte uniforme que cabe, e só depois o estilo (peso, cor,
  destaque de palavra-chave) é aplicado por cima.
- **Max**: até 3 frases em mosaico simultâneo, com hierarquia visual (a
  mais recente em destaque, as anteriores cedendo espaço e opacidade).
- Composição por semente: a mesma frase, em exibições diferentes, sorteia
  arranjos visuais diferentes — layout, rotação, entrada/saída — sem repetir
  o mesmo resultado toda vez.

---

## Saída e integração

### Múltiplos monitores
Saída em um monitor dedicado, ou modo **span**: dois projetores tratados
como uma única tela contínua (a saída detecta os displays e calcula a
composição combinada).

### Overlay para transmissão (OBS)
Servidor HTTP local expõe:
- `/overlay` — página HTML com o texto atual, para usar como **Browser
  Source** no OBS. Mostra exatamente a parte do texto que está na tela no
  momento (não o texto inteiro, se estiver repartido) — overlay e projeção
  sempre mostram o mesmo conteúdo.
- `/live.json` — o mesmo estado, em JSON, para integrações que não usam a
  página HTML diretamente.

### Saída NDI
Envia a saída de projeção como fonte NDI na rede local, para ser recebida
por um switcher/software de transmissão compatível com o protocolo (vMix,
OBS com plugin NDI, etc.) sem precisar de captura de tela.

### Analisador de espectro
Camada visual (não processa áudio, só lê e desenha) sobre a saída.
Fonte configurável: mesa de som/microfone (via dispositivo de entrada de
áudio, com sondagem de canais reais do dispositivo — não uma lista
inventada), câmera ao vivo, ou o áudio da mídia em reprodução. Vários
estilos visuais; posição em tela cheia (fundo) ou em barra inferior (HUD).
Em **câmera ao vivo** ou **mídia** no programa, a barra inferior entra
automaticamente (câmera de fundo em letra/bíblia mantém a posição
escolhida). Opção de também ouvir o áudio nos alto-falantes do Mac,
desligada por padrão e com temporizador de segurança pra evitar loop de
realimentação com a mesa de som.

### Áudio no operador
O **Preview nunca tem som** — só o Programa / janela de saída reproduzem
áudio. Isolamento de voz (RNNoise) vale para câmera e para vídeo/áudio no
ar; se o filtro falhar ao entrar ao vivo, a reprodução segue sem o filtro.

---

## Operação ao vivo

### Avanço automático por fala — previsto, não implementado
Ideia: o app já conhece o plano do show, então não seria reconhecimento de
fala aberto — escutaria a entrada de áudio escolhida, transcreveria
localmente (Whisper on-device, sem serviço externo) e compararia contra as
linhas candidatas do plano atual (a próxima da sequência, o refrão anterior,
ou um salto dentro da mesma música), assumindo o AO VIVO quando encontrasse
correspondência.

**Estado real:** ainda **não faz parte deste repositório público**. A
especificação acima é o alvo; a implementação só sobe quando estiver
validada no uso ao vivo. Hoje o avanço é só por teclado / clique.

### Atalhos de teclado
Cobrem o fluxo inteiro ao vivo: enviar ao ar, avançar/voltar linha, black,
armar próxima frase.
