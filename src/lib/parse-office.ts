import * as XLSX from "xlsx";
import mammoth from "mammoth";
import AdmZip from "adm-zip";
import pdf from "pdf-parse";

const MAX_EXCEL_ROWS = 200;
const MAX_WORD_CHARS = 5000;
const MAX_PDF_CHARS = 20000;

function parseExcel(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1 });
    if (data.length === 0) {
      parts.push(`## Sheet: ${sheetName}\n\n(空)`);
      continue;
    }

    const rows = data.slice(0, MAX_EXCEL_ROWS);
    const mdLines = rows.map(
      (row) => "| " + (Array.isArray(row) ? row.map((c) => String(c ?? "")).join(" | ") : String(row ?? "")) + " |"
    );

    parts.push(
      `## Sheet: ${sheetName} (${data.length} 行 x ${Math.max(...data.map((r) => (Array.isArray(r) ? r.length : 1)))} 列)` +
        (data.length > MAX_EXCEL_ROWS ? `，显示前 ${MAX_EXCEL_ROWS} 行` : "") +
        "\n\n" +
        mdLines.join("\n")
    );
  }

  return parts.join("\n\n");
}

async function parseWord(buf: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buf });
  let text = result.value.trim();
  if (!text) return "(无文本内容)";
  if (text.length > MAX_WORD_CHARS) {
    text = text.slice(0, MAX_WORD_CHARS) + `\n\n...(已截断，共 ${text.length} 字符)`;
  }
  return text;
}

async function parsePdf(buf: Buffer): Promise<string> {
  const data = await pdf(buf);
  let text = (data.text || "").trim();
  if (!text) return "(PDF 无可提取文本，可能是扫描件)";
  if (text.length > MAX_PDF_CHARS) {
    text = text.slice(0, MAX_PDF_CHARS) + `\n\n...(已截断，共 ${text.length} 字符)`;
  }
  return text;
}

function parsePptx(buf: Buffer): string {
  const zip = new AdmZip(buf);
  const entries = zip
    .getEntries()
    .filter((e) => e.entryName.startsWith("ppt/slides/slide") && e.entryName.endsWith(".xml"))
    .sort((a, b) => {
      const na = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || "0");
      const nb = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || "0");
      return na - nb;
    });

  if (entries.length === 0) return "(未找到幻灯片内容)";

  const parts: string[] = [];
  for (const entry of entries) {
    const xml = entry.getData().toString("utf-8");
    const texts: string[] = [];
    const regex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null) {
      const t = match[1].trim();
      if (t) texts.push(t);
    }
    const slideNum = entry.entryName.match(/slide(\d+)/)?.[1] || "?";
    parts.push(`### Slide ${slideNum}\n\n${texts.join("\n")}`);
  }

  return parts.join("\n\n---\n\n");
}

export async function parseOfficeFile(buf: Buffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "xlsx":
    case "xls":
      return parseExcel(buf);
    case "docx":
      return parseWord(buf);
    case "pptx":
      return parsePptx(buf);
    case "pdf":
      return parsePdf(buf);
    default:
      return `[不支持的文件格式: .${ext}]`;
  }
}
