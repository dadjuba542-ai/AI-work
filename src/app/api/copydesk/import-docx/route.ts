import mammoth from "mammoth";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "缺少文件" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return Response.json({ error: "仅支持 .docx 文件" }, { status: 400 });
    }

    const arr = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(arr) });
    const html = (result.value || "").trim();
    return Response.json({ html: html || "<p><br/></p>" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "导入失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

