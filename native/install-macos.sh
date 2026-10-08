#!/bin/bash
set -eu
if [ "$(uname -s)" != "Darwin" ]; then
  printf '%s\n' 'Installer ini hanya untuk macOS.' >&2
  exit 1
fi
native_dir="$(cd "$(dirname "$0")" && pwd)"
extension_id="${1:-}"
if ! [[ "$extension_id" =~ ^[a-p]{32}$ ]]; then
  printf '%s\n' 'Gunakan: bash native/install-macos.sh ID_EKSTENSI' >&2
  exit 1
fi
xcrun swiftc "$native_dir/auth.swift" -o "$native_dir/tab-lock-auth"
"$native_dir/tab-lock-auth" --install "$extension_id"
