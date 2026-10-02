#!/bin/bash
#  Run this to play:  ./start-linux.sh
#  Checks for Node.js, helps you install it if missing, then opens the game.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  The Tables needs Node.js, and it is not installed yet."
  echo ""
  # Auto-install needs root, which we won't take on someone's behalf — so print
  # the exact one-line command for whichever package manager this machine has.
  if command -v apt-get >/dev/null 2>&1; then
    echo "    sudo apt-get update && sudo apt-get install -y nodejs"
  elif command -v dnf >/dev/null 2>&1; then
    echo "    sudo dnf install -y nodejs"
  elif command -v pacman >/dev/null 2>&1; then
    echo "    sudo pacman -S --noconfirm nodejs"
  elif command -v zypper >/dev/null 2>&1; then
    echo "    sudo zypper install -y nodejs"
  else
    echo "    Install Node.js from https://nodejs.org"
  fi
  echo ""
  echo "  Run that, then start this again."
  exit 1
fi

exec node serve.mjs
