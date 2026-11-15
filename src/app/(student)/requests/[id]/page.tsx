import { RequestScreen } from "@/modules/operations/screens";
export default async function Page({params}:{params:Promise<{id:string}>}){return <RequestScreen id={(await params).id}/>;}
