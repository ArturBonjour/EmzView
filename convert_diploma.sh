#!/usr/bin/env bash
# =============================================================================
# convert_diploma.sh — Конвертация диплома ВКР из Markdown в DOCX
# Формат: КФУ / КАДиТП 2025 (Times New Roman 14pt, 1.5 интервал, поля ГОСТ)
#
# Зависимости:
#   macOS  : brew install pandoc
#   Ubuntu : sudo apt install pandoc
#   Windows: winget install --id JohnMacFarlane.Pandoc  (или pandoc.org)
#
# Использование:
#   chmod +x convert_diploma.sh
#   ./convert_diploma.sh
#
# Результат: Диплом_ВКР_EMZ_View.docx
# После конвертации откройте в Word и выполните шаги из раздела «После Word»
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$SCRIPT_DIR/Диплом_ВКР_EMZ_View.md"
OUTPUT="$SCRIPT_DIR/Диплом_ВКР_EMZ_View.docx"
REFERENCE="$SCRIPT_DIR/diploma_reference.docx"

# ── 0. Проверяем наличие pandoc ───────────────────────────────────────────────
if ! command -v pandoc &>/dev/null; then
  echo "❌  pandoc не найден."
  echo "    macOS  : brew install pandoc"
  echo "    Ubuntu : sudo apt install pandoc"
  echo "    Windows: https://github.com/jgm/pandoc/releases/latest"
  exit 1
fi

PANDOC_VERSION="$(pandoc --version | head -1 | awk '{print $2}')"
echo "✅  pandoc ${PANDOC_VERSION} найден"

if [ ! -f "$INPUT" ]; then
  echo "❌  Файл исходника не найден: $INPUT"
  exit 1
fi

# ── 1. Создаём reference.docx если отсутствует ────────────────────────────────
if [ ! -f "$REFERENCE" ]; then
  echo "📄  Создаю базовый diploma_reference.docx…"

  # Пробуем встроенный шаблон pandoc
  if pandoc --print-default-data-file reference.docx > "$REFERENCE" 2>/dev/null; then
    echo "    Базовый шаблон создан."
  else
    # Fallback: генерируем из минимального markdown
    printf '# Заголовок\n\nТекст\n' | pandoc -o "$REFERENCE" 2>/dev/null || true
  fi

  if [ -f "$REFERENCE" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║  ВАЖНО: настройте diploma_reference.docx перед повторным       ║"
    echo "║  запуском этого скрипта.                                        ║"
    echo "║                                                                  ║"
    echo "║  1. Откройте diploma_reference.docx в MS Word.                  ║"
    echo "║  2. Стиль «Обычный» (Normal):                                   ║"
    echo "║     • Шрифт: Times New Roman, 14 пт, чёрный                     ║"
    echo "║     • Межстрочный интервал: 1,5 строки                          ║"
    echo "║     • Абзацный отступ: 1,25 см                                  ║"
    echo "║     • Выравнивание: по ширине                                    ║"
    echo "║     • Интервал после абзаца: 0 пт                               ║"
    echo "║  3. Стиль «Заголовок 1» (Heading 1):                            ║"
    echo "║     • Шрифт: Times New Roman, 14 пт, без начертания             ║"
    echo "║     • Выравнивание: по центру                                    ║"
    echo "║     • Интервал после: 12 пт                                      ║"
    echo "║     • Нет нумерации, нет Ё                                       ║"
    echo "║  4. Стиль «Заголовок 2» (Heading 2):                            ║"
    echo "║     • Шрифт: Times New Roman, 14 пт, без начертания             ║"
    echo "║     • Выравнивание: по центру                                    ║"
    echo "║  5. Поля страницы:                                               ║"
    echo "║     верх 20 мм | низ 20 мм | справа 15 мм | слева 30 мм        ║"
    echo "║  6. Сохраните и повторно запустите скрипт.                      ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
  fi
fi

# ── 2. Конвертация ────────────────────────────────────────────────────────────
echo "🔄  Конвертирую: $INPUT"
echo "          →  $OUTPUT"

PANDOC_ARGS=(
  # Входной формат: стандартный Markdown + умные кавычки + таблицы + код
  "--from=markdown+smart+pipe_tables+fenced_code_blocks+bracketed_spans"
  # Выходной формат
  "--to=docx"
  "--output=${OUTPUT}"
  # Не переносить строки автоматически (сохраняем форматирование)
  "--wrap=none"
  # Автоматическое оглавление (3 уровня)
  "--toc"
  "--toc-depth=3"
  # Язык документа — русский (для корректных переносов и кавычек)
  "--metadata=lang:ru-RU"
  # Подсветка синтаксиса кода
  "--highlight-style=kate"
)

if [ -f "$REFERENCE" ]; then
  PANDOC_ARGS+=("--reference-doc=${REFERENCE}")
else
  echo "⚠️   diploma_reference.docx не найден — форматирование будет по умолчанию"
fi

pandoc "${PANDOC_ARGS[@]}" "$INPUT"

echo ""
echo "✅  Готово: $OUTPUT"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  ОБЯЗАТЕЛЬНЫЕ ДЕЙСТВИЯ В MS WORD после открытия файла:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "  1. ПОЛЯ СТРАНИЦЫ"
echo "     Макет → Поля → Настраиваемые поля:"
echo "     Верх: 2,0 см  |  Низ: 2,0 см  |  Право: 1,5 см  |  Лево: 3,0 см"
echo ""
echo "  2. ШРИФТ ВСЕГО ТЕКСТА"
echo "     Ctrl+A → Главная → Шрифт: Times New Roman, 14 пт, чёрный"
echo "     Убедитесь: нет курсива, нет жирного, нет подчёркивания в основном тексте"
echo ""
echo "  3. МЕЖСТРОЧНЫЙ ИНТЕРВАЛ"
echo "     Ctrl+A → Абзац → Межстрочный: Полуторный (1,5)"
echo "     Интервал после абзаца: 0 пт"
echo ""
echo "  4. АБЗАЦНЫЙ ОТСТУП основного текста"
echo "     Ctrl+A → Абзац → Отступ первой строки: 1,25 см"
echo "     Заголовки и подписи рисунков/таблиц — отступ 0"
echo ""
echo "  5. НУМЕРАЦИЯ СТРАНИЦ"
echo "     Вставка → Номер страницы → Внизу страницы → По центру"
echo "     Нумерация начинается с титула, но номер на титуле НЕ печатается"
echo "     На странице «Содержание» должен стоять номер 2 (или 3)"
echo ""
echo "  6. АВТОМАТИЧЕСКИЕ ПЕРЕНОСЫ"
echo "     Макет → Расстановка переносов → Авто"
echo ""
echo "  7. ОБНОВИТЬ ОГЛАВЛЕНИЕ"
echo "     Ссылки → Обновить таблицу → Обновить всю таблицу"
echo "     Убедитесь, что приложения перечислены в содержании без номеров страниц"
echo ""
echo "  8. ТАБЛИЦЫ"
echo "     Заголовки столбцов таблиц — выравнивание по центру"
echo "     Шапка каждой таблицы: «Таблица X.X — Название» выровнять по правому краю"
echo ""
echo "  9. ПРИЛОЖЕНИЯ"
echo "     Слово «Приложение А/Б/В» — в правом верхнем углу страницы"
echo "     Название приложения — на следующей строке, по центру"
echo ""
echo "  10. СПИСОК МАРКЕРОВ"
echo "      Маркированные списки: заменить символ «•» на тире «–»"
echo "      (выделить список → Абзац → Список → изменить символ маркера на –)"
echo ""
echo "═══════════════════════════════════════════════════════════════════"

