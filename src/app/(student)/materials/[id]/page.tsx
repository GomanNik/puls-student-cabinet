import { MaterialScreen } from "./screen";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <MaterialScreen id={(await params).id} />; }
