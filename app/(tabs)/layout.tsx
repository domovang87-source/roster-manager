import BottomNav from "../../components/BottomNav";
import { ProStatusProvider } from "../../lib/use-pro-status";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProStatusProvider>
      <div className="min-h-[100dvh] min-h-screen pb-20">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">{children}</div>
        <BottomNav />
      </div>
    </ProStatusProvider>
  );
}
