#!/bin/bash
# Log the GitHub CLI in for THIS session (Cowork/cloud sandboxes keep nothing between sessions).
#   tools/gh-login.sh          -> uses the token file Marcos keeps at <folder>/.git/github-token (never committed)
#   tools/gh-login.sh code     -> no token file: starts the GitHub device flow, prints the code for Marcos
#   tools/gh-login.sh finish   -> after Marcos entered the code: fetches the token and logs in
set -u
FOLDER=${FOLDER:-$HOME/mnt/TimeSpent}
TOKEN_FILE=$FOLDER/.git/github-token
CLIENT_ID=178c6fc778ccc68e1d6a   # GitHub CLI's public OAuth client id
export PATH=$HOME/bin:$PATH
if ! command -v gh >/dev/null 2>&1; then
  TAG=$(curl -sS https://api.github.com/repos/cli/cli/releases/latest | python3 -c 'import sys,json;print(json.load(sys.stdin)["tag_name"])')
  case "$(uname -m)" in aarch64|arm64) A=arm64;; *) A=amd64;; esac
  mkdir -p "$HOME/bin" && curl -sSL "https://github.com/cli/cli/releases/download/$TAG/gh_${TAG#v}_linux_$A.tar.gz" \
    | tar xz -C "$HOME/bin" --strip-components=2 "gh_${TAG#v}_linux_$A/bin/gh"
fi
case "${1:-auto}" in
  auto)
    if [ -s "$TOKEN_FILE" ]; then
      tr -d '[:space:]' < "$TOKEN_FILE" | gh auth login --with-token && gh auth setup-git && gh auth status
    else
      echo "No token file at $TOKEN_FILE. Run '$0 code', ask Marcos to enter the code, then '$0 finish'."; exit 1
    fi;;
  code)
    curl -sS -X POST -H 'Accept: application/json' https://github.com/login/device/code \
      -d "client_id=$CLIENT_ID" --data-urlencode 'scope=repo read:org workflow' > "$HOME/.ghdev.json"
    python3 - "$HOME/.ghdev.json" <<'PY'
import json,sys; d=json.load(open(sys.argv[1]))
print("Ask Marcos to open %s and enter the code %s (valid %d min)" % (d["verification_uri"], d["user_code"], d["expires_in"]//60))
PY
    ;;
  finish)
    DC=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["device_code"])' "$HOME/.ghdev.json")
    curl -sS -X POST -H 'Accept: application/json' https://github.com/login/oauth/access_token \
      -d "client_id=$CLIENT_ID" -d "device_code=$DC" -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
      | python3 -c 'import sys,json;d=json.load(sys.stdin);t=d.get("access_token");print(t) if t else sys.exit("not authorized yet: %s" % d.get("error"))' \
      | gh auth login --with-token && gh auth setup-git && gh auth status && : > "$HOME/.ghdev.json";;
  *) echo "usage: $0 [auto|code|finish]"; exit 2;;
esac
