import { PlannedModule } from '@/components/dashboard/planned-module';

export const metadata = { title: "Site visits" };

export default function Page() {
  return (
    <PlannedModule
      title={"Site visits"}
      phase={4}
      summary={"Calendar and list of scheduled visits."}
      features={["Schedule a visit for a lead and property with a broker", "Conflict warnings for double-booked brokers", "Record outcomes and create the next follow-up automatically"]}
    />
  );
}
