import { readSheet } from "read-excel-file/node";

export async function readAccountWorkbook(file) {
  const invalid = (message) => Object.assign(new Error(message), { status: 400 }),
    maxBytes = 2 * 1024 * 1024;
  if (!file || file.__type !== "Blob" || !/\.xlsx$/i.test(file.name || "") ||
      typeof file.data !== "string" || file.data.length > Math.ceil(maxBytes / 3) * 4)
    throw invalid("Hãy chọn tệp XLSX hợp lệ, tối đa 2 MB.");
  const bytes = Buffer.from(file.data, "base64");
  if (!bytes.length || bytes.length > maxBytes) throw invalid("Tệp XLSX trống hoặc vượt quá 2 MB.");
  let rows;
  try { rows = await readSheet(bytes); }
  catch (_) { throw invalid("Không đọc được XLSX. Hãy dùng tệp Excel không đặt mật khẩu."); }
  if (rows.length > 2001) throw invalid("Chỉ nhập tối đa 2.000 tài khoản mỗi lần.");
  return rows;
}
