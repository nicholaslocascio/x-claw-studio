import { CloneTweetWorkbench } from "@/src/components/clone-tweet-workbench";

export default async function ClonePage(props: {
  searchParams?: Promise<{
    tweetId?: string;
    url?: string;
    text?: string;
  }>;
}) {
  const searchParams = (await props.searchParams) ?? {};

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />
      <CloneTweetWorkbench initialTweetId={searchParams.tweetId} initialUrl={searchParams.url} initialText={searchParams.text} />
    </main>
  );
}
