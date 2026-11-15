"""Создание вымышленных учебных PDF/DOCX. Запускать bundled Python; без сети."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from docx import Document
from docx.shared import Pt

root = Path(__file__).resolve().parent.parent
out = root / "src/assets/learning"
out.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("Noto", str(root / "src/assets/fonts/NotoSans-Regular.ttf")))
for name, title, lines in [
    ("notes.pdf", "Конспект по учебному исследованию", [
        "Самостоятельный материал. Не является выданным заданием.",
        "Источник - запись, документ или наблюдение, используемое в исследовании.",
        "Факт отделяют от интерпретации и проверяют по независимым источникам.",
        "В конспекте указывают тему, основные тезисы и ограничения вывода.",
        "Пример: сравнить две вымышленные записи о развитии учебной библиотеки."]),
    ("guide.pdf", "Методические рекомендации к работе", [
        "Цель - научиться обосновывать вывод по исходным сведениям.",
        "1. Сформулируйте исследовательский вопрос.",
        "2. Сопоставьте два вымышленных источника и отметьте различия.",
        "3. Подготовьте таблицу наблюдений и краткий вывод.",
        "4. Укажите, каких сведений не хватает для уверенного ответа."])
]:
    pdf = canvas.Canvas(str(out / name), pagesize=(595, 842), invariant=1)
    pdf.setTitle(title)
    pdf.setFont("Noto", 17)
    pdf.drawString(42, 785, title)
    pdf.setFont("Noto", 11)
    for i, line in enumerate(lines):
        pdf.drawString(42, 736 - i * 34, line)
    pdf.setFont("Noto", 9)
    pdf.drawString(42, 48, "ПУЛЬС. Вымышленные сведения. Неофициальный конкурсный прототип.")
    pdf.save()

doc = Document()
doc.styles["Normal"].font.name = "Arial"
doc.styles["Normal"].font.size = Pt(11)
doc.add_heading("Структура учебного решения", 0)
doc.add_paragraph("Демонстрационная методичка ПУЛЬС. Все сведения вымышлены.")
for title, text in [
    ("Цель", "Опишите вопрос, на который отвечает работа."),
    ("Исходные сведения", "Укажите источники и доступные факты без домыслов."),
    ("Решение", "Запишите ход рассуждений и объясните выбор метода."),
    ("Вывод", "Сопоставьте результат с целью и укажите ограничения.")
]:
    doc.add_heading(title, 1)
    doc.add_paragraph(text)
doc.save(out / "solution.docx")
