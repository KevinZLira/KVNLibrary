#!/bin/bash
# Double-click entry point (macOS Finder runs .command files in Terminal).
cd "$(dirname "$0")" || exit 1
echo "===================================================="
echo "  YouTube Importer - Instalando no Adobe Premiere Pro"
echo "===================================================="
echo
bash install/install-mac.sh
echo
read -p "Pressione Enter para fechar esta janela..." _
