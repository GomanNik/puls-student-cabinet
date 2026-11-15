import { commandRoute } from "@/shared/server/command";
import { AssistantQuestionSchema,AssistantResponseSchema } from "@/shared/contracts/student-api";
import { askAssistant } from "@/modules/assistant/service";
export const runtime="nodejs";
export const POST=commandRoute(AssistantQuestionSchema,AssistantResponseSchema,async(auth,input)=>({body:{data:await askAssistant(auth,input),meta:{requestId:auth.requestId}}}));
