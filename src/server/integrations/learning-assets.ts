import "server-only";
import fs from "node:fs";
import path from "node:path";
// Фиксированные пути, без преобразования browser input в путь/URL.
const root=path.resolve(process.cwd(),"src/assets/learning");
export const learningAssets={
  guide:{file:"guide.pdf",filename:"Методические рекомендации.pdf",mime:"application/pdf"},
  notes:{file:"notes.pdf",filename:"Конспект.pdf",mime:"application/pdf"},
  solution:{file:"solution.docx",filename:"Структура решения.docx",mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
  research:{file:"research.pptx",filename:"Учебное исследование.pptx",mime:"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
  observations:{file:"observations.xlsx",filename:"Наблюдения.xlsx",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
} as const;
export function fixtureMaterialContent(handle:string){
  const key=handle.replace(/^fixture-file:/,"");
  if(!handle.startsWith("fixture-file:")||!Object.hasOwn(learningAssets,key))return null;
  const asset=learningAssets[key as keyof typeof learningAssets],file=path.join(root,asset.file);
  try{
    // realpath защищает также от symlink escape при ошибочной упаковке.
    const canonical=fs.realpathSync(file),relative=path.relative(fs.realpathSync(root),canonical);
    if(relative.startsWith("..")||path.isAbsolute(relative))return null;
    const stat=fs.statSync(canonical);if(!stat.isFile()||stat.size>20*1024*1024)return null;
    return {...asset,bytes:fs.readFileSync(canonical)};
  }catch{return null;}
}
