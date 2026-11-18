import type { Material } from "@/shared/contracts/student-api";

export function materialFormat(item: Material) {
  if (item.kind === "LINK") return "LINK";
  const mime = item.mimeType?.toLowerCase() ?? "";
  const extension = item.title.split(".").at(-1)?.toUpperCase();
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "DOCX";
  if (mime.includes("presentationml") || mime === "application/vnd.ms-powerpoint") return "PPTX";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel") return "XLSX";
  return extension && ["PDF", "DOCX", "PPTX", "XLSX"].includes(extension) ? extension : "ФАЙЛ";
}
