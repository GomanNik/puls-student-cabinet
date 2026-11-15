import { config } from "dotenv";
config({path:process.env.PULS_ENV_FILE??".env.local",quiet:true});
const { administrationTick }=await import("../src/modules/operations/worker");
const { database }=await import("../src/shared/server/db");
const { cleanupSecurityData }=await import("../src/shared/server/security-audit");
let cleanupAt=0;
let stopped=false;
process.on("SIGTERM",()=>{stopped=true;});process.on("SIGINT",()=>{stopped=true;});
console.info("ПУЛЬС: обработчик заявок и переписки запущен (тестовый источник).");
while(!stopped){try{if(Date.now()>=cleanupAt){cleanupAt=Date.now()+60_000;try{await cleanupSecurityData();}catch{console.error("ПУЛЬС: очистка технических данных отложена.");}}await administrationTick(()=>stopped);}catch{console.error("ПУЛЬС: цикл доставки недоступен; повтор через 5 секунд.");}if(!stopped)await new Promise(resolve=>setTimeout(resolve,5000));}
await database().$disconnect();
