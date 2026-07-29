#!/bin/bash
# ProShow — inicia o operador (Vite + Electron)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Node local (Mac da igreja) ou Homebrew / sistema
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Node.js não encontrado.\nInstale Node ou confira ~/.local/node/bin" buttons {"OK"} default button 1 with title "ProShow" with icon stop' 2>/dev/null || true
  echo "ERRO: node não encontrado no PATH"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Instalando dependências (primeira vez)…"
  npm install
fi

# Evita duas instâncias brigando pela porta 5173
pkill -f "ible-projection.*vite|ible-projection.*electron|VITE_DEV_SERVER_URL=.*electron" 2>/dev/null || true
# Mais específico: processos neste diretório
pkill -f "$ROOT/node_modules/.bin/vite" 2>/dev/null || true
pkill -f "$ROOT/node_modules/electron/dist/Electron" 2>/dev/null || true
sleep 0.4

echo "▶ ProShow"
echo "  pasta: $ROOT"
echo "  node:  $(command -v node) ($(node -v))"
echo ""

exec npm run dev
