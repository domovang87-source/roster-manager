import BottomNav from "../../components/BottomNav";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-20">
      <div className="mx-auto w-full max-w-5xl px-6 py-6">{children}</div>
      <BottomNav />
    </div>
  );
}
