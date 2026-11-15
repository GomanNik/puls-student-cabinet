import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { securityAudit } from "@/shared/server/security-audit";
import { AppError } from "@/shared/server/errors";
import { transaction } from "@/shared/server/transaction";
import { profileSchema, sessionSchema } from "@/shared/contracts/auth";
import { type ServerConfig } from "@/shared/server/config";
import { assertAuthContext, createAuthContext, type AuthContext } from "./context";
import { boundedLogin, dummyPasswordHash, verifyPassword } from "./password";

export const IDLE_MS = 12 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
export const digestToken = (token: string) => createHash("sha256").update(token).digest();
type Bucket = { key_digest: Uint8Array; window_start: Date; failed_count: number; blocked_until: Date | null };
const unauthorized = () => new AppError(401, "SESSION_EXPIRED", "Сессия завершилась. Войдите снова.");

export class AuthService {
  constructor(readonly db: PrismaClient, private config: ServerConfig, private clock: () => Date = () => new Date()) {}

  async login(login: string, password: string, ip: string, previousToken?: string, requestId?: string) {
    try { return await boundedLogin(async () => {
      const loginKey=createHmac("sha256",this.config.AUTH_RATE_LIMIT_HMAC_KEY).update(`login:${login}`).digest();
      const ipKey=createHmac("sha256",this.config.AUTH_RATE_LIMIT_HMAC_KEY).update(`ip:${ip}`).digest();
      // Резерв попытки учитывает параллельные проверки. Ни Argon2, ни dummy
      // hash не выполняются под SQL lock; неуспех сохраняет израсходованный резерв.
      const reserved=await transaction(this.db,async tx=>{
        const now=this.clock(), keys=[loginKey,ipKey].sort(Buffer.compare), buckets:Bucket[]=[];
        for(const key of keys)await tx.$executeRaw`INSERT INTO auth_rate_bucket(key_digest,window_start,failed_count) VALUES(${key},${now},0) ON CONFLICT DO NOTHING`;
        for(const key of keys){const [row]=await tx.$queryRaw<Bucket[]>`SELECT * FROM auth_rate_bucket WHERE key_digest=${key} FOR UPDATE`;buckets.push(row);}
        for(const row of buckets){
          if(+now-+row.window_start>=WINDOW_MS && (!row.blocked_until || row.blocked_until<=now)){
            row.failed_count=0;row.window_start=now;row.blocked_until=null;
          }
          const max=Buffer.from(row.key_digest).equals(loginKey)?5:30;
          if(row.failed_count>=max || row.blocked_until && row.blocked_until>now)
            return {limited:Math.max(1,Math.ceil((+(row.blocked_until??new Date(+row.window_start+WINDOW_MS))-+now)/1000)),buckets:[]};
        }
        for(const row of buckets)await tx.authRateBucket.update({where:{keyDigest:new Uint8Array(row.key_digest)},data:{windowStart:row.window_start,failedCount:row.failed_count+1,blockedUntil:row.failed_count+1>=(Buffer.from(row.key_digest).equals(loginKey)?5:30)?new Date(+now+WINDOW_MS):null}});
        return {limited:0,buckets};
      });
      if(reserved.limited)throw new AppError(429,"RATE_LIMITED","Слишком много попыток. Повторите позже.",reserved.limited);
      const dummy=await dummyPasswordHash();
      const credential=await this.db.accountCredential.findUnique({where:{loginIdentifierNormalized:login}});
      const matches=await verifyPassword(credential?.passwordHash??dummy,password);
      if(!matches||!credential)throw new AppError(401,"INVALID_CREDENTIALS","Неверный логин или пароль");
      const result=await transaction(this.db,async tx=>{
        const now=this.clock();
        await tx.$queryRaw`SELECT account_id FROM student_account WHERE account_id=${credential.accountId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT c.credential_id FROM account_credential c JOIN student_account a ON a.account_id=c.account_id WHERE c.credential_id=${credential.credentialId}::uuid FOR SHARE OF c,a`;
        const live=await tx.accountCredential.findUnique({where:{credentialId:credential.credentialId},include:{account:{include:{profile:true}}}});
        if(!live||live.passwordHash!==credential.passwordHash||live.credentialStateCode!=="ACTIVE"||live.account.accountStateCode!=="ACTIVE")throw new AppError(401,"INVALID_CREDENTIALS","Неверный логин или пароль");
        // Успех освобождает только свой резерв и только в том же окне.
        for(const row of reserved.buckets)await tx.$executeRaw`UPDATE auth_rate_bucket SET failed_count=greatest(0,failed_count-1),blocked_until=CASE WHEN failed_count-1<${Buffer.from(row.key_digest).equals(loginKey)?5:30} THEN NULL ELSE blocked_until END WHERE key_digest=${Buffer.from(row.key_digest)} AND window_start=${row.window_start}`;
        if(previousToken)await tx.authSession.updateMany({where:{tokenDigest:digestToken(previousToken),revokedAt:null},data:{revokedAt:now}});
        const token=randomBytes(32).toString("base64url"),session=await tx.authSession.create({data:{accountId:live.accountId,tokenDigest:digestToken(token),issuedAt:now,expiresAt:new Date(+now+ABSOLUTE_MS),lastActivityAt:now}});
        await tx.studentAccount.update({where:{accountId:live.accountId},data:{lastAuthenticatedAt:now}});
        return {kind:"ok" as const,accountId:live.accountId,token,expires:session.expiresAt,data:sessionSchema.parse({displayName:live.account.profile?.fullName??"Студент",expiresAt:new Date(+now+IDLE_MS).toISOString(),absoluteExpiresAt:session.expiresAt.toISOString()})};
      });
      await securityAudit("AUTH_LOGIN_SUCCESS",{requestId,accountId:result.accountId,target:"SESSION"});return result;
    }); } catch(error) {
      await securityAudit(error instanceof AppError&&error.status===429?"AUTH_LOGIN_RATE_LIMIT":"AUTH_LOGIN_FAIL",{requestId,target:"SESSION"});throw error;
    }
  }

  private liveWhere(now: Date): Prisma.AuthSessionWhereInput {
    return { revokedAt: null, expiresAt: { gt: now }, lastActivityAt: { gt: new Date(now.getTime() - IDLE_MS) },
      account: { accountStateCode: "ACTIVE", credentials: { some: { credentialStateCode: "ACTIVE", credentialTypeCode: "LOGIN_PASSWORD" } } } };
  }

  async requireSession(token: string | undefined, requestId: string): Promise<AuthContext> {
    if (!token) throw new AppError(401, "AUTH_REQUIRED", "Войдите в личный кабинет.");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthorized();
    const now = this.clock();
    const session = await this.db.authSession.findFirst({ where: { tokenDigest: digestToken(token), ...this.liveWhere(now) } });
    if (!session) throw unauthorized();
    if (now.getTime() - session.lastActivityAt.getTime() >= 5 * 60 * 1000) {
      const updated = await this.db.authSession.updateMany({ where: { sessionId: session.sessionId, ...this.liveWhere(now) }, data: { lastActivityAt: now } });
      if (updated.count !== 1) throw unauthorized();
    }
    return createAuthContext(session.accountId, session.sessionId, requestId);
  }

  async session(context: AuthContext) {
    assertAuthContext(context);
    const row = await this.db.authSession.findFirst({ where: { sessionId: context.sessionId, accountId: context.accountId, ...this.liveWhere(this.clock()) }, include: { account: { include: { profile: true } } } });
    if (!row) throw unauthorized();
    return sessionSchema.parse({ displayName: row.account.profile?.fullName ?? "Студент",
      expiresAt: new Date(Math.min(row.expiresAt.getTime(), row.lastActivityAt.getTime() + IDLE_MS)).toISOString(), absoluteExpiresAt: row.expiresAt.toISOString() });
  }

  async profile(context: AuthContext) {
    assertAuthContext(context);
    // OGE learning-access: owner predicate входит в запрос, роль/ID браузера отсутствуют.
    const row = await this.db.studentProfile.findFirst({ where: { accountId: context.accountId,
      account: { sessions: { some: { sessionId: context.sessionId, ...this.liveWhere(this.clock()) } } } },
      include: { faculty: true, studyProgram: true, academicGroup: true } });
    await this.session(context);
    const parsed = profileSchema.parse({ fullName: row?.fullName??null, faculty: row?.faculty?.name??null,
      studyProgram: row?.studyProgram?.name??null, course: row?.courseNumber??null, group: row?.academicGroup?.displayName??null });
    return parsed;
  }

  async logout(token?: string, requestId?:string) {
    const result=token?await this.db.authSession.updateMany({ where: { tokenDigest: digestToken(token), revokedAt: null }, data: { revokedAt: this.clock() } }):null;
    if(result?.count)await securityAudit("SESSION_REVOKED",{requestId,target:"SESSION"});
  }
}
