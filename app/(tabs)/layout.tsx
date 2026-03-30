import { Suspense } from "react";
import BottomNav from "../../components/BottomNav";
import CheckoutReturnHandler from "../../components/CheckoutReturnHandler";
import TabsSubscriptionShell from "../../components/TabsSubscriptionShell";
import { ProStatusProvider } from "../../lib/use-pro-status";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProStatusProvider>
      <Suspense fallback={null}>
        <CheckoutReturnHandler />
      </Suspense>
      <TabsSubscriptionShell>
        <div className="min-h-[100dvh] min-h-screen pb-20">
          <div className="mx-auto w-full max-w-5xl px-6 py-6">{children}</div>
          <BottomNav />
        </div>
      </TabsSubscriptionShell>
    </ProStatusProvider>
  );
}
