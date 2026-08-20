import { createFileRoute } from "@tanstack/react-router";

import { ChapterStudy } from "../../../../repertoire/chapter-study.tsx";

export const Route = createFileRoute("/_app/repertoire/$repertoireId/$chapterId")({
  component: ChapterStudy,
});
