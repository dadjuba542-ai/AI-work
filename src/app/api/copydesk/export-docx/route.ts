import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

interface ExportBody {
  html?: string;
  filename?: string;
}

function htmlToParagraphs(html: string): Paragraph[] {
  const normalized = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [new Paragraph("")];

  return lines.map((line) => {
    if (line.startsWith("# ")) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: line.slice(2), bold: true })],
      });
    }
    if (line.startsWith("## ")) {
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: line.slice(3), bold: true })],
      });
    }
    return new Paragraph({ children: [new TextRun(line)] });
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ExportBody;
    const html = (body.html || "").trim();
    if (!html) return Response.json({ error: "没有可导出的内容" }, { status: 400 });

    const doc = new Document({
      sections: [{ children: htmlToParagraphs(html) }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${(body.filename || "copydesk-export").replace(/[^\w\-]+/g, "_")}.docx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "导出失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

