import { PlannedModule } from '@/components/dashboard/planned-module';

export const metadata = { title: "Reports" };

export default function Page() {
  return (
    <PlannedModule
      title={"Reports"}
      phase={6}
      summary={"Performance and conversion reporting."}
      features={["Leads by stage, source, campaign and locality", "Qualified-lead and site-visit conversion rates with clear denominators", "Recorded vs projected brokerage revenue", "Broker activity and performance with drill-downs"]}
    />
  );
}
