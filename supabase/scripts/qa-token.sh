#!/usr/bin/env bash
# ImovelMap — gera um corretor descartavel e imprime um access_token valido.
#
# Serve para testar a EF `ingerir` e o handoff de sessao da extensao sem
# precisar da senha de ninguem: cria a conta pelo signup publico com uma
# senha aleatoria gerada aqui, confirma o e-mail e faz login.
#
#   ./qa-token.sh                 # cria (ou reusa) e imprime o token
#   ./qa-token.sh --limpar        # apaga a conta de QA
#
# Precisa de: curl, python3 e (para confirmar o e-mail) o comando psql com
# SUPABASE_DB_URL, ou confirmar manualmente pelo dashboard.

set -euo pipefail

URL="${SUPABASE_URL:-https://jmtrkygcndaqnrgobnqo.supabase.co}"
KEY="${SUPABASE_PUBLISHABLE_KEY:-sb_publishable_nju5FZicYwkdvwy7vp-KXA_jjKyinLC}"
EMAIL="${QA_EMAIL:-qa-ingerir@imovelmap.com}"
PWFILE="${TMPDIR:-/tmp}/imovelmap-qa-pw"

if [[ "${1:-}" == "--limpar" ]]; then
  echo "Apague pelo dashboard (Authentication > Users) ou:"
  echo "  delete from auth.users where email = '$EMAIL';"
  rm -f "$PWFILE"
  exit 0
fi

if [[ ! -f "$PWFILE" ]]; then
  printf 't%sAa1@' "$(openssl rand -hex 16)" > "$PWFILE"
  chmod 600 "$PWFILE"
fi
PW="$(cat "$PWFILE")"

curl -s -X POST "$URL/auth/v1/signup" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" > /dev/null || true

# o projeto exige confirmacao de e-mail; confirme com:
#   update auth.users set email_confirmed_at = now() where email = '<QA_EMAIL>';

RESP="$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}")"

python3 - "$RESP" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
tok = d.get("access_token")
if tok:
    print(tok)
else:
    print("falhou:", d, file=sys.stderr)
    print("se for 'Email not confirmed', rode o update em auth.users", file=sys.stderr)
    sys.exit(1)
PY
