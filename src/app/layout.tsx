import type { Metadata } from "next";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "ПУЛЬС — личный кабинет студента",
  description: "Неофициальный конкурсный прототип личного кабинета студента. Только вымышленные данные.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}
