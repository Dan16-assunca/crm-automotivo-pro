#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Aplica os templates de e-mail do Supabase Auth via Management API
# Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/apply-email-templates.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_REF="eakdywmuewvuzyqfpcpl"
API_URL="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "❌ Defina a variável SUPABASE_ACCESS_TOKEN antes de executar."
  echo "   Gere em: https://supabase.com/dashboard/account/tokens"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/../supabase/email-templates"

# Lê e escapa os templates
confirmation=$(cat "$TEMPLATES_DIR/confirmation.html" | jq -Rs .)
recovery=$(cat "$TEMPLATES_DIR/recovery.html" | jq -Rs .)
invite=$(cat "$TEMPLATES_DIR/invite.html" | jq -Rs .)

echo "📧 Aplicando templates de e-mail no projeto $PROJECT_REF..."

curl -s -X PATCH "$API_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"mailer_subjects_confirmation\": \"Confirme seu e-mail — CRM Automotivo Pro\",
    \"mailer_templates_confirmation_content\": $confirmation,
    \"mailer_subjects_recovery\": \"Redefinir senha — CRM Automotivo Pro\",
    \"mailer_templates_recovery_content\": $recovery,
    \"mailer_subjects_invite\": \"Convite para a equipe — CRM Automotivo Pro\",
    \"mailer_templates_invite_content\": $invite,
    \"mailer_subjects_magic_link\": \"Seu link de acesso — CRM Automotivo Pro\",
    \"mailer_subjects_email_change\": \"Confirme sua nova senha — CRM Automotivo Pro\"
  }" | jq .

echo ""
echo "✅ Pronto! Templates aplicados com sucesso."
echo "   Verifique em: https://supabase.com/dashboard/project/$PROJECT_REF/auth/templates"
