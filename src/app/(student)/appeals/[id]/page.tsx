import { AppealScreen } from "@/modules/operations/screens";
export default async function Page({params}:{params:Promise<{id:string}>}){return <AppealScreen id={(await params).id}/>;}
