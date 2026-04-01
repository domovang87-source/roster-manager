import LandingMarketing from "../components/LandingMarketing";
import { ProStatusProvider } from "../lib/use-pro-status";

export default function RootPage() {
  return (
    <ProStatusProvider>
      <LandingMarketing />
    </ProStatusProvider>
  );
}
