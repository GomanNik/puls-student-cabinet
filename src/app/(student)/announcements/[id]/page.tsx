import { AnnouncementScreen } from "@/modules/community/screens";
export default async function Page({params}:{params:Promise<{id:string}>}){return <AnnouncementScreen id={(await params).id}/>;}
