"""Renders the invitation report (see reports.py) as a PDF with reportlab
(already a project dependency)."""

import io
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

CHANNEL_LABELS = {
    "WHATSAPP": "WhatsApp",
    "EMAIL": "Email",
    "SMS": "SMS",
    "VOICE_CALL": "Voice Call",
}

RESPONSE_LABELS = {
    "PENDING": "Pending",
    "ACCEPTED": "Accepted",
    "REJECTED": "Declined",
    "MAYBE": "Maybe",
}

NAVY = colors.HexColor("#1F2A44")
GRID = colors.HexColor("#D7DBE3")
STRIPE = colors.HexColor("#F7F8FA")

# ---------------------------------------------------------------------
# Fonts. The built-in Helvetica only knows basic Latin, so a guest called
# "Müller" or "Łukasz" would print as black boxes. The DejaVu Sans files
# already bundled for the invitation cards cover far more; if they are
# missing the report still renders, just with Helvetica.
# ---------------------------------------------------------------------

_FONT_DIR = Path(__file__).resolve().parent / "fonts"
_REGULAR = "Helvetica"
_BOLD = "Helvetica-Bold"


def _register_fonts() -> None:
    global _REGULAR, _BOLD

    regular_path = _FONT_DIR / "DejaVuSans.ttf"
    bold_path = _FONT_DIR / "DejaVuSans-Bold.ttf"

    if _REGULAR != "Helvetica":
        return

    try:
        if regular_path.exists() and bold_path.exists():
            pdfmetrics.registerFont(TTFont("ReportSans", str(regular_path)))
            pdfmetrics.registerFont(TTFont("ReportSans-Bold", str(bold_path)))
            pdfmetrics.registerFontFamily(
                "ReportSans", normal="ReportSans", bold="ReportSans-Bold"
            )
            _REGULAR, _BOLD = "ReportSans", "ReportSans-Bold"
    except Exception:  # a broken font file must not break the download
        _REGULAR, _BOLD = "Helvetica", "Helvetica-Bold"


def _safe(value) -> str:
    """Text for a reportlab Paragraph: it parses XML, so `&`, `<` and `>` in
    a guest or event name must be escaped or the PDF fails to build."""

    return escape(str(value if value is not None else ""))


def _styles() -> dict:
    base = getSampleStyleSheet()

    for name in ("Title", "Heading2", "Heading3", "BodyText"):
        base[name].fontName = _BOLD if name != "BodyText" else _REGULAR

    return {
        "title": base["Title"],
        "h2": base["Heading2"],
        "h3": base["Heading3"],
        "body": base["BodyText"],
        "cell": ParagraphStyle("cell", parent=base["BodyText"], fontName=_REGULAR, fontSize=8, leading=10),
        "cell_head": ParagraphStyle(
            "cell_head", parent=base["BodyText"], fontName=_BOLD, fontSize=8, leading=10,
            textColor=colors.white,
        ),
    }


def _table_style(font_size: int, pad: int, align_from: int) -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), _BOLD),
            ("FONTNAME", (0, 1), (-1, -1), _REGULAR),
            ("FONTSIZE", (0, 0), (-1, -1), font_size),
            ("GRID", (0, 0), (-1, -1), 0.5, GRID),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, STRIPE]),
            ("ALIGN", (align_from, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), pad),
            ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
        ]
    )


def _channel_totals_table(send_summary: dict) -> Table:
    data = [["Channel", "Sent", "Failed", "Reminders Sent"]]

    for channel, totals in send_summary.items():
        data.append(
            [
                CHANNEL_LABELS.get(channel, channel),
                str(totals["sent"]),
                str(totals["failed"]),
                str(totals["reminders_sent"]),
            ]
        )

    table = Table(data, hAlign="LEFT", colWidths=[4 * cm, 3 * cm, 3 * cm, 4 * cm])
    table.setStyle(_table_style(9, 6, 1))
    return table


def _rsvp_totals_table(rsvp_summary: dict) -> Table:
    data = [["Response", "Guests", "Headcount"]]

    for response_status, totals in rsvp_summary.items():
        data.append(
            [
                RESPONSE_LABELS.get(response_status, response_status),
                str(totals["guests"]),
                str(totals["headcount"]),
            ]
        )

    table = Table(data, hAlign="LEFT", colWidths=[4 * cm, 4 * cm, 4 * cm])
    table.setStyle(_table_style(9, 6, 1))
    return table


def _guest_detail_table(guest_details: list[dict], styles: dict) -> Table:
    cell, head = styles["cell"], styles["cell_head"]

    data = [
        [Paragraph(label, head) for label in
         ("Guest", "Category", "Invitation", "Response", "Channels", "Reminders")]
    ]

    for row in guest_details:
        data.append(
            [
                # Paragraphs wrap long names instead of running into the
                # next column.
                Paragraph(_safe(row["guest_name"]), cell),
                Paragraph(_safe(row["category_name"] or "Uncategorized"), cell),
                Paragraph(_safe(row["invitation_status"].replace("_", " ").title()), cell),
                Paragraph(_safe(RESPONSE_LABELS.get(row["response_status"], row["response_status"])), cell),
                Paragraph(
                    _safe(", ".join(CHANNEL_LABELS.get(c, c) for c in row["channels_used"]) or "-"),
                    cell,
                ),
                Paragraph(str(row["reminders_sent"]), cell),
            ]
        )

    table = Table(
        data,
        hAlign="LEFT",
        colWidths=[3.9 * cm, 3 * cm, 2.6 * cm, 2.4 * cm, 3.2 * cm, 2.4 * cm],
        repeatRows=1,
    )
    table.setStyle(_table_style(8, 5, 2))
    return table


def _page_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont(_REGULAR, 8)
    canvas.setFillColor(colors.HexColor("#94A3B8"))
    canvas.drawString(1.5 * cm, 1 * cm, "LavernaEvents - Invitation Report")
    canvas.drawRightString(A4[0] - 1.5 * cm, 1 * cm, f"Page {doc.page}")
    canvas.restoreState()


def render_report_pdf(report: dict) -> bytes:
    """Render the full report dict (see invitations.reports.build_full_report)
    as a PDF, returned as raw bytes."""

    _register_fonts()
    styles = _styles()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        title=f"Invitation Report - {report['event_name']}",
    )

    elements = [
        Paragraph(_safe(report["event_name"]), styles["title"]),
        Paragraph("Invitation Report", styles["h2"]),
        Paragraph(
            f"Generated {datetime.now().strftime('%d %b %Y, %I:%M %p')}",
            styles["body"],
        ),
        Spacer(1, 0.3 * cm),
        Paragraph(
            f"Total guests: {report['total_guests']} &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"Total expected headcount: {report['total_expected_headcount']}",
            styles["body"],
        ),
        Spacer(1, 0.6 * cm),
        Paragraph("Send Summary", styles["h2"]),
        Spacer(1, 0.2 * cm),
        _channel_totals_table(report["send_summary"]),
        Spacer(1, 0.6 * cm),
        Paragraph("RSVP Summary", styles["h2"]),
        Spacer(1, 0.2 * cm),
        _rsvp_totals_table(report["rsvp_summary"]),
        Spacer(1, 0.6 * cm),
    ]

    if report["category_breakdown"]:
        elements.append(Paragraph("Breakdown by Category", styles["h2"]))
        elements.append(Spacer(1, 0.2 * cm))

        for category in report["category_breakdown"]:
            elements.append(Paragraph(_safe(category["category_name"]), styles["h3"]))
            elements.append(Spacer(1, 0.15 * cm))
            elements.append(_channel_totals_table(category["send_summary"]))
            elements.append(Spacer(1, 0.2 * cm))
            elements.append(_rsvp_totals_table(category["rsvp_summary"]))
            elements.append(Spacer(1, 0.4 * cm))

    elements.append(PageBreak())
    elements.append(Paragraph("Guest Detail Log", styles["h2"]))
    elements.append(Spacer(1, 0.2 * cm))

    if report["guest_details"]:
        elements.append(_guest_detail_table(report["guest_details"], styles))
    else:
        elements.append(Paragraph("No guests added to this event yet.", styles["body"]))

    doc.build(elements, onFirstPage=_page_footer, onLaterPages=_page_footer)

    return buffer.getvalue()
