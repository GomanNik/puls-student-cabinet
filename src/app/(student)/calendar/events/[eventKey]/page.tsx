import { CalendarEventScreen } from "@/modules/community/screens";
export default async function Page({params,searchParams}:{params:Promise<{eventKey:string}>;searchParams:Promise<{on?:string}>}){return <CalendarEventScreen id={(await params).eventKey} on={(await searchParams).on??""}/>;}
