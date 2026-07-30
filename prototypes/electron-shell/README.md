# ProShow

Operador de projeção (Electron + React).

## O que tem

- **Janela Operador** (`#/operator`) — plano do show, preview, biblioteca, saídas
- **Janela Saída** (`#/output`) — fullscreen / span 2 monitores, always-on-top
- **Overlay OBS** — `http://127.0.0.1:8787/overlay`
- Hotkeys: `←` `→` / Espaço, `B` = black, `Cmd+Shift+F` = reafirmar saída

## Abas

1. **Show** — biblioteca, frases, preview e plano
2. **Temas** — studio de temas
3. **Saídas** — monitores, NDI, overlay

## Rodar

**Mais fácil (Mac):** duplo clique em `IBLE Projection.app` ou `Abrir IBLE Projection.command` (atalhos locais; o produto se chama ProShow).

No Mac da igreja os atalhos já estão no **Desktop**.

```bash
cd prototypes/electron-shell   # ou ~/ible-projection
./start-ible.sh
# ou
npm start
```

Só o React no browser (sem dual window):

```bash
npm run dev:web
# abrir http://127.0.0.1:5173/#/operator
```
