import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/auth/password";
import { demoStudents } from "./seed-data";

export async function seedStudents(db: PrismaClient, passwords: readonly [string, string]) {
  if (passwords.some(p => [...p].length < 16 || [...p].length > 256 || Buffer.byteLength(p, "utf8") > 1024) || passwords[0] === passwords[1])
    throw new Error("Нужны два разных пароля длиной от 16 до 256 символов.");
  const hashes = await Promise.all(passwords.map(hashPassword));
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(18203001)`;
    const accounts: string[] = [];
    for (const [index, student] of demoStudents.entries()) {
      const existing = await tx.accountCredential.findUnique({ where: { loginIdentifierNormalized: student.login } });
      if (existing) {
        const account=await tx.studentAccount.findUnique({where:{accountId:existing.accountId},include:{profile:true,identities:true}});
        // Повтор seed не выдаёт неисправные/чужие аккаунты за подготовленные
        // и не отменяет блокировку или ротацию пароля оператора.
        if(!account?.isDemoAccount||account.accountStateCode!=="ACTIVE"||existing.credentialStateCode!=="ACTIVE"||!existing.passwordHash.startsWith("$argon2id$")||!account.profile||!account.identities.some(i=>i.sourceCode==="UNIVERSITY_FIXTURE"&&i.externalStudentId===student.externalStudentId))
          throw new Error("Существующий демонстрационный аккаунт требует восстановления оператором; seed не изменяет его учётные данные.");
        accounts.push(existing.accountId); continue;
      }
      const faculty = await tx.facultyRef.create({ data: { name: student.faculty } });
      const program = await tx.studyProgramRef.create({ data: { name: student.studyProgram, facultyId: faculty.facultyId } });
      const group = await tx.academicGroupRef.create({ data: { groupCode: student.group, displayName: student.group, programId: program.programId } });
      const account = await tx.studentAccount.create({ data: {
        credentials: { create: { loginIdentifierNormalized: student.login, passwordHash: hashes[index] } },
        profile: { create: { fullName: student.fullName, ...(index===1&&process.env.PULS_SEED_PARTIAL_PROFILE_B==="1"?{facultyId:null,studyProgramId:null,academicGroupId:null,courseNumber:null}:{facultyId:faculty.facultyId,studyProgramId:program.programId,academicGroupId:group.groupId,courseNumber:student.course}) } },
        identities: { create: { sourceCode: "UNIVERSITY_FIXTURE", externalStudentId: student.externalStudentId } },
      } });
      accounts.push(account.accountId);
    }
    return accounts;
  });
}
