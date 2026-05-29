import * as XLSX from "xlsx";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "缺少文件" }, { status: 400 });

    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    let rows: Array<Array<string | number | boolean | null>> = [];

    if (name.endsWith(".csv")) {
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1, defval: "" });
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1, defval: "" });
    } else {
      return Response.json({ error: "仅支持 .xlsx/.xls/.csv" }, { status: 400 });
    }

    if (rows.length === 0) return Response.json({ headers: [], rows: [] });

    const maxCols = Math.max(
      1,
      ...rows.map((r) =>
        Array.isArray(r) ? r.length : 0
      )
    );
    const normalizedRows = rows.map((r) =>
      Array.from({ length: maxCols }, (_, i) => r?.[i] ?? "")
    );

    const firstRow = normalizedRows[0] || [];
    const nonEmptyInFirst = firstRow.filter((c) => String(c ?? "").trim() !== "").length;
    const hasHeader = nonEmptyInFirst >= Math.max(2, Math.floor(maxCols / 2));

    const headers = hasHeader
      ? firstRow.map((c, i) => {
          const v = String(c ?? "").trim();
          return v || `列${i + 1}`;
        })
      : Array.from({ length: maxCols }, (_, i) => `列${i + 1}`);
    const body = hasHeader ? normalizedRows.slice(1) : normalizedRows;

    return Response.json({ headers, rows: body });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "导入失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
