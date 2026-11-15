// Операторская генерация фикстур bundled Node + @oai/artifact-tool. Без сети.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const modules=process.env.PULS_ARTIFACT_MODULES;
if(!modules)throw Error("Укажите PULS_ARTIFACT_MODULES из load_workspace_dependencies");
const require=createRequire(path.join(modules,"..","package.json"));
const {Presentation,PresentationFile,Workbook,SpreadsheetFile}=await import(pathToFileURL(require.resolve("@oai/artifact-tool")).href);
const output=path.resolve("src/assets/learning");await fs.mkdir(output,{recursive:true});
const deck=Presentation.create({slideSize:{width:1280,height:720}});
for(const [title,body] of [
  ["Как исследовать учебный источник","Определите автора, время и цель записи.\nОтделите наблюдение от интерпретации."],
  ["Как представить результат","Сравните сведения в таблице.\nСформулируйте вывод и укажите, чего пока не знаете."]
]){
  const slide=deck.slides.add();slide.background.fill="#FFFFFF";
  for(const [text,y,size] of [[title,72,42],[body,220,28],["ПУЛЬС. Вымышленные сведения. Неофициальный конкурсный прототип.",640,17]]){
    const box=slide.shapes.add({geometry:"textbox",position:{left:72,top:y,width:1136,height:y===220?300:64},fill:"none",line:{fill:"none",width:0}});
    box.text=text;box.text.style={fontFamily:"Arial",fontSize:size,color:"#172033"};
  }
}
await (await PresentationFile.exportPptx(deck)).save(path.join(output,"research.pptx"));
const book=Workbook.create(),sheet=book.worksheets.add("Наблюдения");
sheet.getRange("A1:C6").values=[
  ["Учебный пример","Источник А","Источник Б"],
  ["Год записи",2024,2025],["Встречи библиотеки",8,12],
  ["Посетители",120,180],["Вывод","Встреч стало больше","Нужна проверка причин"],
  ["ПУЛЬС","Все сведения вымышлены","Неофициальный прототип"]
];
await (await SpreadsheetFile.exportXlsx(book)).save(path.join(output,"observations.xlsx"));
