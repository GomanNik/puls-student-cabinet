import { config } from "dotenv";
config({path:process.env.PULS_ENV_FILE??".env.local",quiet:true});
const { administrationTick }=await import("../src/modules/operations/worker");
const { database }=await import("../src/shared/server/db");
const { cleanupSecurityData }=await import("../src/shared/server/security-audit");
let cleanupAt=0;
let stopped=false;
let lastFailure:string|null=null,consecutiveFailures=0;
function safeFailure(error:unknown){
  const value=error&&typeof error==="object"?error as {name?:unknown;code?:unknown;errorCode?:unknown;meta?:{code?:unknown};cause?:{code?:unknown}}:null;
  const safe=(part:unknown)=>typeof part==="string"&&/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(part)?part:null;
  return `${safe(value?.name)??"Error"}/${safe(value?.code)??safe(value?.errorCode)??safe(value?.meta?.code)??safe(value?.cause?.code)??"UNKNOWN"}`;
}
process.on("SIGTERM",()=>{stopped=true;});process.on("SIGINT",()=>{stopped=true;});
console.info("ПУЛЬС: обработчик заявок и переписки запущен (тестовый источник).");
while(!stopped){
  try{
    if(Date.now()>=cleanupAt){cleanupAt=Date.now()+60_000;try{await cleanupSecurityData();}catch(error){console.error(`ПУЛЬС: очистка технических данных отложена (${safeFailure(error)}).`);}}
    await administrationTick(()=>stopped);
    if(lastFailure)console.info("ПУЛЬС: цикл доставки восстановлен.");
    lastFailure=null;consecutiveFailures=0;
  }catch(error){
    const failure=safeFailure(error);
    consecutiveFailures++;
    if(failure!==lastFailure||consecutiveFailures%12===0)
      console.error(`ПУЛЬС: цикл доставки недоступен (${failure}); повтор через 5 секунд; последовательных ошибок: ${consecutiveFailures}.`);
    lastFailure=failure;
  }
  if(!stopped)await new Promise(resolve=>setTimeout(resolve,5000));
}
await database().$disconnect();
