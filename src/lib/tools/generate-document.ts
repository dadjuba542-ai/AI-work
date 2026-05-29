import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import * as XLSX from "xlsx";
import PptxGenJS from "pptxgenjs";
import { writeFileSync, mkdirSync, existsSync, statSync, readdirSync, unlinkSync, rmdirSync } from "fs";
import { join } from "path";

const DOWNLOADS_DIR = join(process.cwd(), "data", "downloads");

function userDir(userId: string): string {
  const dir = join(DOWNLOADS_DIR, userId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupOldFiles() {
  if (!existsSync(DOWNLOADS_DIR)) return;
  const now = Date.now();
  const cutoff = 7 * 24 * 60 * 60 * 1000;
  for (const userDirName of readdirSync(DOWNLOADS_DIR)) {
    const userDirPath = join(DOWNLOADS_DIR, userDirName);
    if (!statSync(userDirPath).isDirectory()) continue;
    for (const entry of readdirSync(userDirPath)) {
      const fp = join(userDirPath, entry);
      try {
        const s = statSync(fp);
        if (s.isDirectory()) {
          if (now - s.mtimeMs > cutoff) {
            for (const f of readdirSync(fp)) unlinkSync(join(fp, f));
            rmdirSync(fp);
          }
        } else {
          if (now - s.mtimeMs > cutoff) unlinkSync(fp);
        }
      } catch {}
    }
  }
}

export async function generateDocument(args: {
  format: string;
  filename: string;
  content: string;
}, userId?: string): Promise<string> {
  cleanupOldFiles();

  const uid = userId || "anonymous";
  const id = crypto.randomUUID();
  const dir = join(userDir(uid), id);
  mkdirSync(dir, { recursive: true });

  let filepath: string;

  switch (args.format) {
    case "xlsx": {
      filepath = join(dir, args.filename + ".xlsx");
      let rows: Array<Array<string | number | boolean | null>> = [];
      try {
        rows = JSON.parse(args.content);
      } catch {
        rows = args.content.split("\n").map((r) => r.split(/[,\t]/));
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, filepath);
      break;
    }
    case "docx": {
      filepath = join(dir, args.filename + ".docx");
      const doc = new Document({
        sections: [{ children: markdownToDocx(args.content) }],
      });
      const buffer = await Packer.toBuffer(doc);
      writeFileSync(filepath, buffer);
      break;
    }
    case "pptx": {
      filepath = join(dir, args.filename + ".pptx");
      const pres = new PptxGenJS();
      const slides = args.content.split(/(?=^#{1,2}\s)/m).filter(Boolean);
      for (const block of slides) {
        const lines = block.trim().split("\n");
        const title = lines[0].replace(/^#+\s*/, "");
        const body = lines.slice(1).join("\n").trim();
        const slide = pres.addSlide();
        slide.background = { color: "F9FAFB" };
        slide.addText(title, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true, color: "1F2937" });
        if (body) {
          slide.addText(body, { x: 0.5, y: 1.4, w: 9, h: 5, fontSize: 16, color: "4B5563", lineSpacingMultiple: 1.5, valign: "top" });
        }
      }
      await pres.writeFile({ fileName: filepath });
      break;
    }
    default: {
      filepath = join(dir, args.filename + ".md");
      writeFileSync(filepath, args.content, "utf-8");
    }
  }

  const fname = args.filename + "." + args.format;
  return JSON.stringify({ url: `/api/download/${uid}/${id}/${encodeURIComponent(fname)}`, filename: fname, _note: "请通知用户：文件已生成，请在下方工具卡片中点击下载链接。" });
}

function markdownToDocx(md: string): Paragraph[] {
  return md.split("\n").map((line) => {
    if (line.startsWith("## ")) {
      return new Paragraph({
        children: [new TextRun({ text: line.slice(3), bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_2,
      });
    }
    if (line.startsWith("# ")) {
      return new Paragraph({
        children: [new TextRun({ text: line.slice(2), bold: true, size: 32 })],
        heading: HeadingLevel.HEADING_1,
      });
    }
    if (line.startsWith("- ")) {
      return new Paragraph({ children: [new TextRun("• " + line.slice(2))] });
    }
    return new Paragraph({ children: [new TextRun(line)] });
  });
}
