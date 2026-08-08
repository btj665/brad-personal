#!/bin/bash
#  Double-click to play. Checks for Node.js, offers to install it if missing, then
#  starts the game in your browser.
#
#  The first time, macOS may say this is from an unidentified developer. If so,
#  right-click (or Control-click) this file and choose Open, then Open again.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  # Homebrew keeps its own binaries off the default PATH in a fresh Terminal, so
  # add the two standard locations before deciding node is really absent.
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  The Tables needs Node.js, and it is not installed yet."
  echo ""
  if command -v brew >/dev/null 2>&1; then
    echo "  Installing Node.js with Homebrew..."
    echo ""
    brew install node
  else
    echo "  Opening the Node.js download page. Install it, then run this again."
    echo "  (The 'macOS Installer' .pkg is the simplest choice.)"
    open "https://nodejs.org/en/download/prebuilt-installer"
    echo ""
    read -n 1 -s -r -p "  Press any key to close."
    echo ""
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js was installed but isn't on the path yet."
  echo "  Please double-click this file once more to start."
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

exec node serve.mjs
