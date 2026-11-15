import { CalendarScreen } from "@/modules/community/screens";
import { fixtureProvider } from "@/server/integrations/fixture-provider";
export default function Page(){return <CalendarScreen today={fixtureProvider().today()}/>;}
