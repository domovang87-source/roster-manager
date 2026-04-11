import { Suspense } from "react";
import BottomNav from "../../components/BottomNav";
import CheckoutReturnHandler from "../../components/CheckoutReturnHandler";
import TabsSubscriptionShell from "../../components/TabsSubscriptionShell";
import { ProStatusProvider } from "../../lib/use-pro-status";
import { ToastProvider } from "../../components/ui/Toast";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProStatusProvider>
      <ToastProvider>
        <Suspense fallback={null}>
          <CheckoutReturnHandler />
        </Suspense>
        <TabsSubscriptionShell>
          <div className="min-h-[100dvh] min-h-screen pb-24">
            <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">{children}</div>
            <BottomNav />
          </div>
        </TabsSubscriptionShell>
      </ToastProvider>
    </ProStatusProvider>
  );
}
