import "server-only";
import { createHmac,randomUUID } from "node:crypto";
import type { AuthContext } from "@/modules/auth/context";
import { assertAuthContext } from "@/modules/auth/context";
import { readConfig } from "./config";
import { database } from "./db";
import { Prisma,rows,run } from "./sql";
import { transaction } from "./transaction";
import { AppError } from "./errors";
import { lockAndRevalidateSession } from "./session-guard";
let activeAi=0;
export async function consumeAccountBudget(auth:AuthContext, scope:"SEARCH"|"EXPORT"|"EXPORT_PREVIEW"|"NOTIFICATION_READ") {
  assertAuthContext(auth);
  const limit={SEARCH:30,EXPORT:4,EXPORT_PREVIEW:10,NOTIFICATION_READ:20}[scope];
  const key=createHmac("sha256",readConfig().AUTH_RATE_LIMIT_HMAC_KEY).update(JSON.stringify(["api",scope,auth.accountId])).digest();
  const result=await transaction(database(),async tx=>{
    await lockAndRevalidateSession(tx,auth);
    const [b]=await rows<{failed_count:number;retry:number}>(Prisma.sql`INSERT INTO auth_rate_bucket(key_digest,window_start,failed_count) VALUES(${key},now(),1) ON CONFLICT(key_digest) DO UPDATE SET failed_count=CASE WHEN auth_rate_bucket.window_start<=now()-interval '60 seconds' THEN 1 ELSE auth_rate_bucket.failed_count+1 END,window_start=CASE WHEN auth_rate_bucket.window_start<=now()-interval '60 seconds' THEN now() ELSE auth_rate_bucket.window_start END RETURNING failed_count,greatest(1,ceil(extract(epoch FROM window_start+interval '60 seconds'-now())))::int AS retry`,tx);
    return b;
  });
  if(result.failed_count>limit)throw new AppError(429,"RATE_LIMITED","Слишком много запросов. Повторите позже.",result.retry);
}
export async function withAssistantBudget<T>(auth:AuthContext,action:()=>Promise<T>){
  assertAuthContext(auth);
  if(activeAi>=3)throw new AppError(429,"RATE_LIMITED","Помощник занят. Попробуйте чуть позже.",15);
  activeAi++;const lease=randomUUID();let acquired=false;
  try{
    await transaction(database(),async tx=>{
      await lockAndRevalidateSession(tx,auth);
      await run(Prisma.sql`SELECT account_id FROM student_account WHERE account_id=${auth.accountId}::uuid FOR UPDATE`,tx);
      await run(Prisma.sql`DELETE FROM service_concurrency_lease WHERE account_id=${auth.accountId}::uuid AND scope_code='ASSISTANT' AND expires_at<now()`,tx);
      if((await rows(Prisma.sql`SELECT lease_id FROM service_concurrency_lease WHERE account_id=${auth.accountId}::uuid AND scope_code='ASSISTANT'`,tx)).length)throw new AppError(429,"RATE_LIMITED","Дождитесь ответа на предыдущий вопрос.",15);
      for(const [window,limit] of [[60,10],[3600,60]]){
        const key=createHmac("sha256",readConfig().AUTH_RATE_LIMIT_HMAC_KEY).update(JSON.stringify(["assistant",auth.accountId,window])).digest();
        const [bucket]=await rows<{failed_count:number}>(Prisma.sql`INSERT INTO auth_rate_bucket(key_digest,window_start,failed_count) VALUES(${key},now(),1) ON CONFLICT(key_digest) DO UPDATE SET failed_count=CASE WHEN auth_rate_bucket.window_start<now()-make_interval(secs=>${window}) THEN 1 ELSE auth_rate_bucket.failed_count+1 END,window_start=CASE WHEN auth_rate_bucket.window_start<now()-make_interval(secs=>${window}) THEN now() ELSE auth_rate_bucket.window_start END RETURNING failed_count`,tx);
        if(bucket.failed_count>limit)throw new AppError(429,"RATE_LIMITED","Лимит вопросов исчерпан. Попробуйте позже.",window);
      }
      await run(Prisma.sql`INSERT INTO service_concurrency_lease(lease_id,account_id,scope_code,expires_at) VALUES(${lease}::uuid,${auth.accountId}::uuid,'ASSISTANT',now()+interval '60 seconds')`,tx);
    });acquired=true;return await action();
  }finally{activeAi--;if(acquired)await run(Prisma.sql`DELETE FROM service_concurrency_lease WHERE lease_id=${lease}::uuid`).catch(()=>{});}
}
let activeExports=0;
export async function withExportBudget<T>(auth:AuthContext,action:()=>Promise<T>){
  assertAuthContext(auth);
  await consumeAccountBudget(auth,"EXPORT");
  if(activeExports>=2)throw new AppError(429,"RATE_LIMITED","Обработчик экспорта занят. Повторите позже.",15);
  activeExports++;const lease=randomUUID();let acquired=false;
  try{
    await transaction(database(),async tx=>{
      await lockAndRevalidateSession(tx,auth);
      await run(Prisma.sql`SELECT account_id FROM student_account WHERE account_id=${auth.accountId}::uuid FOR UPDATE`,tx);
      await run(Prisma.sql`DELETE FROM service_concurrency_lease WHERE account_id=${auth.accountId}::uuid AND scope_code='CALENDAR_EXPORT' AND expires_at<now()`,tx);
      if((await rows(Prisma.sql`SELECT lease_id FROM service_concurrency_lease WHERE account_id=${auth.accountId}::uuid AND scope_code='CALENDAR_EXPORT'`,tx)).length)throw new AppError(429,"RATE_LIMITED","Дождитесь завершения предыдущего экспорта.",15);
      await run(Prisma.sql`INSERT INTO service_concurrency_lease(lease_id,account_id,scope_code,expires_at) VALUES(${lease}::uuid,${auth.accountId}::uuid,'CALENDAR_EXPORT',now()+interval '2 minutes')`,tx);
    });acquired=true;return await action();
  }finally{activeExports--;if(acquired)await run(Prisma.sql`DELETE FROM service_concurrency_lease WHERE lease_id=${lease}::uuid`).catch(()=>{});}
}

let activeMaterials=0;
export async function materialLease(auth:AuthContext){
  assertAuthContext(auth);
  if(activeMaterials>=4)throw new AppError(429,"RATE_LIMITED","Скачивание занято. Повторите позже.",2);
  activeMaterials++;const lease=randomUUID(),deadline=Date.now()+30_000;let acquired=false,released=false;
  const release=async()=>{if(released)return;released=true;activeMaterials--;if(acquired)await run(Prisma.sql`DELETE FROM service_concurrency_lease WHERE lease_id=${lease}::uuid`).catch(()=>{});};
  try{
    await transaction(database(),async tx=>{
      await lockAndRevalidateSession(tx,auth);
      await run(Prisma.sql`SELECT account_id FROM student_account WHERE account_id=${auth.accountId}::uuid FOR UPDATE`,tx);
      await run(Prisma.sql`DELETE FROM service_concurrency_lease WHERE account_id=${auth.accountId}::uuid AND scope_code LIKE 'MATERIAL:%' AND expires_at<now()`,tx);
      if((await rows(Prisma.sql`SELECT lease_id FROM service_concurrency_lease WHERE account_id=${auth.accountId}::uuid AND scope_code LIKE 'MATERIAL:%'`,tx)).length>=2)throw new AppError(429,"RATE_LIMITED","Дождитесь завершения скачивания.",2);
      await run(Prisma.sql`INSERT INTO service_concurrency_lease(lease_id,account_id,scope_code,expires_at) VALUES(${lease}::uuid,${auth.accountId}::uuid,${`MATERIAL:${lease}`},now()+interval '45 seconds')`,tx);
    });acquired=true;return {release,deadline};
  }catch(error){await release();throw error;}
}
