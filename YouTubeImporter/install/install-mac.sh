#!/bin/bash
# Installs the YouTube Importer CEP extension for Adobe Premiere Pro on macOS.
# Run this once from Terminal: bash install/install-mac.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_ID="com.kvnlibrary.youtubeimporter"
TARGET_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/$EXTENSION_ID"

echo "== YouTube Importer — instalação (macOS) =="
echo "Origem: $SOURCE_DIR"
echo "Destino: $TARGET_DIR"

mkdir -p "$HOME/Library/Application Support/Adobe/CEP/extensions"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

rsync -a --exclude 'install' --exclude '.git' "$SOURCE_DIR"/ "$TARGET_DIR"/

echo "Extensão copiada."

echo "Habilitando modo de debug do CEP (necessário para extensões não assinadas)..."
for VERSION in 8 9 10 11 12; do
  defaults write com.adobe.CSXS.$VERSION PlayerDebugMode 1 2>/dev/null || true
done

echo ""
echo "Verificando dependências externas (yt-dlp e ffmpeg)..."
MISSING=0
if ! command -v yt-dlp >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/yt-dlp ] && [ ! -x /usr/local/bin/yt-dlp ]; then
  echo "  - yt-dlp NÃO encontrado."
  MISSING=1
else
  echo "  - yt-dlp encontrado."
fi
if ! command -v ffmpeg >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/ffmpeg ] && [ ! -x /usr/local/bin/ffmpeg ]; then
  echo "  - ffmpeg NÃO encontrado."
  MISSING=1
else
  echo "  - ffmpeg encontrado."
fi

if [ "$MISSING" -eq 1 ]; then
  if command -v brew >/dev/null 2>&1; then
    read -p "Deseja instalar as dependências ausentes agora via Homebrew? [s/N] " ANSWER
    if [[ "$ANSWER" =~ ^[Ss]$ ]]; then
      brew install yt-dlp ffmpeg
    else
      echo "Você pode instalar depois com: brew install yt-dlp ffmpeg"
    fi
  else
    echo "Homebrew não encontrado. Veja o README.md para instruções de instalação manual."
  fi
fi

echo ""
echo "Concluído. Reinicie o Adobe Premiere Pro e abra:"
echo "  Window > Extensions > YouTube Importer"
