import { PlannedModule } from '@/components/dashboard/planned-module';

export const metadata = { title: "Pipeline" };

export default function Page() {
  return (
    <PlannedModule
      title={"Pipeline"}
      phase={3}
      summary={"A kanban board of your 12 pipeline stages."}
      features={["Drag-and-drop stage changes validated on the server", "Stage configuration for owners and admins", "Lost reasons and won deal values"]}
    />
  );
}
