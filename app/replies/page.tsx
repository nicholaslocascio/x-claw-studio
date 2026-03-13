import { ReplyWorkbench } from "@/src/components/reply-workbench";

export default async function RepliesPage(props: {
  searchParams?: Promise<{
    url?: string;
  }>;
}) {
  const searchParams = (await props.searchParams) ?? {};

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />
      <ReplyWorkbench initialUrl={searchParams.url} />
    </main>
  );
}
