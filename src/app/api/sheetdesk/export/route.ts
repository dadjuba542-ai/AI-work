import * as XLSX from "xlsx";

interface ExportBody {
  headers?: string[];
  rows?: Array<Array<string | number | boolean | null>>;
  format?: "xlsx" | "csv";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ExportBody;
    const headers = body.headers || [];
    const rows = body.rows || [];
    if (headers.length === 0) return Response.json({ error: "没有可导出的列" }, { status: 400 });

    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const format = body.format === "csv" ? "csv" : "xlsx";
    const buffer =
      format === "csv"
        ? Buffer.from(XLSX.utils.sheet_to_csv(ws), "utf-8")
        : XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `sheetdesk-export.${format}`;
    const contentType =
      format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "导出失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

