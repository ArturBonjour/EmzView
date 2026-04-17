#!/usr/bin/env bash
# =============================================================================
# convert_diploma.sh — Конвертация диплома ВКР из Markdown в DOCX
# Формат: КФУ 2025 (Times New Roman 14pt, 1.5 интервал, поля по ГОСТ)
#
# Требования:
#   macOS  : brew install pandoc
#   Ubuntu : sudo apt install pandoc
#   Windows: winget install --id JohnMacFarlane.Pandoc  (или с сайта pandoc.org)
#
# Использование:
#   chmod +x convert_diploma.sh
#   ./convert_diploma.sh
#
# Результат: Диплом_ВКР_EMZ_View.docx — откройте в Word и проверьте форматирование
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$SCRIPT_DIR/Диплом_ВКР_EMZ_View.md"
OUTPUT="$SCRIPT_DIR/Диплом_ВКР_EMZ_View.docx"
REFERENCE="$SCRIPT_DIR/diploma_reference.docx"

# ── Проверяем наличие pandoc ──────────────────────────────────────────────────
if ! command -v pandoc &>/dev/null; then
  echo "❌  pandoc не найден."
  echo "    macOS  : brew install pandoc"
  echo "    Ubuntu : sudo apt install pandoc"
  echo "    Windows: https://github.com/jgm/pandoc/releases/latest"
  exit 1
fi

echo "✅  pandoc $(pandoc --version | head -1 | awk '{print $2}') найден"

# ── Шаг 1: создаём reference.docx (если ещё нет) ─────────────────────────────
if [ ! -f "$REFERENCE" ]; then
  echo "📄  Создаю базовый reference.docx…"
  pandoc -o "$REFERENCE" --print-default-data-file reference.docx 2>/dev/null \
    || pandoc --reference-doc="$REFERENCE" -o "$REFERENCE" /dev/null 2>/dev/null \
    || pandoc -o "$REFERENCE" <(echo "# temp") 2>/dev/null || true

  if [ ! -f "$REFERENCE" ]; then
    # fallback: создаём из пустого markdown
    echo "# " | pandoc -o "$REFERENCE" 2>/dev/null || true
  fi

  echo ""
  echo "⚠️   ВАЖНО: После конвертации откройте diploma_reference.docx в Word и"
  echo "    настройте стиль «Normal» (Обычный):"
  echo "      • Шрифт: Times New Roman, 14 пт"
  echo "      • Межстрочный интервал: 1,5 строки"
  echo "      • Абзацный отступ: 1,25 см"
  echo "      • Выравнивание: по ширине"
  echo "    Стиль «Heading 1» (Заголовок 1):"
  echo "      • Шрифт: Times New Roman, 14 пт, обычный (не жирный)"
  echo "      • Выравнивание: по центру"
  echo "      • Интервал после: 12 пт"
  echo "    Поля страницы: верх 20мм, низ 20мм, право 15мм, лево 30мм"
  echo "    Затем повторно запустите этот скрипт."
  echo ""
fi

# ── Шаг 2: конвертация ───────────────────────────────────────────────────────
echo "🔄  Конвертирую $INPUT → $OUTPUT…"

PANDOC_ARGS=(
  --from=markdown+smart+pipe_tables+fenced_code_blocks
  --to=docx
  --output="$OUTPUT"
  --wrap=none
  --toc
  --toc-depth=3
)

if [ -f "$REFERENCE" ]; then
  PANDOC_ARGS+=(--reference-doc="$REFERENCE")
fi

pandoc "${PANDOC_ARGS[@]}" "$INPUT"

echo ""
echo "✅  Готово: $OUTPUT"
echo ""
echo "📋  Обязательные шаги после открытия в Word:"
echo "   1. Поля: Макет → Поля → Настраиваемые поля:"
echo "      верх 2,0 см  |  низ 2,0 см  |  право 1,5 см  |  лево 3,0 см"
echo "   2. Шрифт всего текста: Times New Roman 14 пт (Ctrl+A → выбрать шрифт)"
echo "   3. Межстрочный интервал: 1,5 строки (Ctrl+A → Абзац → Полуторный)"
echo "   4. Нумерация страниц: Вставка → Номер страницы → Снизу по центру"
echo "      (введение начинается с 3-й страницы, первые 2 — титул+содержание)"
echo "   5. Проверьте переносы: Макет → Расстановка переносов → Авто"
echo "   6. Таблицы: заголовки столбцов выровнять по центру"
echo "   7. Обновить оглавление: Ссылки → Обновить таблицу"
