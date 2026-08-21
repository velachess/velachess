import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Badge } from "@velachess/ui/components/badge";
import { buttonVariants } from "@velachess/ui/components/button";
import { Card, CardContent } from "@velachess/ui/components/card";
import { ShimmerButton } from "@velachess/ui/components/shimmer-button";
import {
  ArrowRight,
  Dumbbell,
  Lightbulb,
  ScanSearch,
  Upload,
  VelaChessMark,
} from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";
import type { Variants } from "motion/react";
import {
  div as MotionDiv,
  h1 as MotionHeading,
  li as MotionListItem,
  p as MotionParagraph,
  section as MotionSection,
} from "motion/react-client";
import Image from "next/image";

import { i18n } from "../shared/i18n.ts";
import { LandingHeader } from "./landing-header.tsx";

const PRODUCT_URL = "https://app.velachess.com";
const GITHUB_URL = "https://github.com/velachess/velachess";
const CONTRIBUTE_URL = `${GITHUB_URL}/blob/main/CONTRIBUTING.md`;
const SELF_HOST_URL = `${GITHUB_URL}/blob/main/docs/how-to/self-host.md`;
const DOCUMENTATION_URL = `${GITHUB_URL}/tree/main/docs`;
const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const VIEWPORT = { once: true, amount: 0.3 } as const;
const EASE = [0.22, 1, 0.36, 1] as const;

const COPY = {
  brand: msg`VelaChess`,
  product: msg`Product`,
  gameAnalysis: msg`Game Analysis`,
  drill: msg`Drill`,
  project: msg`Project`,
  resources: msg`Resources`,
  publicBeta: msg`Public Beta 🎉`,
  heroTitle: msg`Turn your games into training.`,
  heroBody: msg`Import your Chess.com and Lichess games. VelaChess finds the decisions that cost you, then turns them into training built from the games you actually play.`,
  tryForFree: msg`Try for free`,
  tryVelaChess: msg`Try VelaChess`,
  analysisAlt: msg`VelaChess game analysis showing a blunder on move two`,
  workflowTitle: msg`One loop, grounded in your games.`,
  workflowBody: msg`Every step keeps the game you played, the mistake you made, and the position you need to remember connected.`,
  importTitle: msg`Import`,
  importBody: msg`Connect Chess.com or Lichess and bring your games together.`,
  analyzeTitle: msg`Analyze`,
  analyzeBody: msg`Stockfish grades the choices that changed your winning chances.`,
  understandTitle: msg`Understand`,
  understandBody: msg`Spot recurring mistakes and weaknesses in the openings you play.`,
  trainTitle: msg`Train`,
  trainBody: msg`Solve those positions again on a schedule that adapts to you.`,
  productTitle: msg`Game Analysis becomes Drill.`,
  productBody: msg`Move from a clear explanation of what changed to focused practice on the exact position.`,
  analysisTitle: msg`See the moment the game changed.`,
  analysisBody: msg`Walk through every move with Stockfish evaluation, clear move classification, and the better continuation shown on the board.`,
  inspectGames: msg`Inspect your games`,
  drillTitle: msg`The analysis becomes a training loop.`,
  drillBody: msg`Replay positions from your own mistakes, get immediate feedback, and let the next review arrive when it is useful.`,
  drillAlt: msg`VelaChess drill showing feedback and the next review date`,
  startDrilling: msg`Start drilling`,
  github: msg`GitHub`,
  contribute: msg`Contribute`,
  selfHost: msg`Self-host`,
  finalTitle: msg`Train on the games you actually play.`,
  finalBody: msg`Connect an account and turn your next mistake into a position you will remember.`,
  documentation: msg`Documentation`,
  license: msg`License`,
  footerBody: msg`Personalized chess training from your own games.`,
  copyright: msg`© VelaChess. Open-source chess training.`,
} as const;

const WORKFLOW = [
  { title: COPY.importTitle, body: COPY.importBody, icon: Upload },
  { title: COPY.analyzeTitle, body: COPY.analyzeBody, icon: ScanSearch },
  { title: COPY.understandTitle, body: COPY.understandBody, icon: Lightbulb },
  { title: COPY.trainTitle, body: COPY.trainBody, icon: Dumbbell },
] as const;

const FOOTER_GROUPS = [
  {
    title: COPY.product,
    links: [
      { label: COPY.gameAnalysis, href: "#game-analysis" },
      { label: COPY.drill, href: "#drill" },
    ],
  },
  {
    title: COPY.project,
    links: [
      { label: COPY.github, href: GITHUB_URL },
      { label: COPY.contribute, href: CONTRIBUTE_URL },
      { label: COPY.selfHost, href: SELF_HOST_URL },
    ],
  },
  {
    title: COPY.resources,
    links: [
      { label: COPY.documentation, href: DOCUMENTATION_URL },
      { label: COPY.license, href: LICENSE_URL },
    ],
  },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <LandingHeader />
      <main className="mx-auto max-w-7xl px-6 pt-40">
        <Hero />
        <ProductShowcases />
        <Workflow />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <MotionSection
      id="top"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <MotionDiv
        data-motion-reveal
        className="flex items-center justify-center"
        variants={fadeUpVariants}
      >
        <Badge variant="outline" className="h-auto px-4 py-2 text-sm font-medium">
          {i18n._(COPY.publicBeta)}
        </Badge>
      </MotionDiv>
      <div className="mt-8 text-center">
        <MotionHeading
          data-motion-reveal
          className="font-display text-4xl font-bold tracking-tight sm:text-6xl"
          variants={fadeUpVariants}
        >
          {i18n._(COPY.heroTitle)}
        </MotionHeading>
        <MotionParagraph
          data-motion-reveal
          className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted-foreground"
          variants={fadeUpVariants}
        >
          {i18n._(COPY.heroBody)}
        </MotionParagraph>
      </div>
      <MotionDiv
        data-motion-reveal
        className="my-6 mb-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-x-4"
        variants={fadeUpVariants}
      >
        <ShimmerButton
          render={<a href={PRODUCT_URL} aria-label={i18n._(COPY.tryForFree)} />}
          className="h-11 gap-2"
        >
          {i18n._(COPY.tryForFree)}
          <ArrowRight className="size-4" />
        </ShimmerButton>
      </MotionDiv>
      <div className="relative">
        <picture className="block">
          <source media="(max-width: 40rem)" srcSet="/product/game-analysis-640.webp" />
          <source media="(max-width: 48rem)" srcSet="/product/game-analysis-768.webp" />
          <Image
            src="/product/game-analysis.webp"
            alt={i18n._(COPY.analysisAlt)}
            width={1440}
            height={900}
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            className="h-auto w-full rounded-md border shadow-lg"
          />
        </picture>
      </div>
    </MotionSection>
  );
}

function Workflow() {
  return (
    <section id="how-it-works" className="py-24 sm:py-32">
      <SectionIntro title={COPY.workflowTitle} body={COPY.workflowBody} />
      <ol className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {WORKFLOW.map((step, index) => (
          <WorkflowStep
            key={step.title.id}
            title={step.title}
            body={step.body}
            icon={step.icon}
            index={index}
          />
        ))}
      </ol>
    </section>
  );
}

function WorkflowStep({
  title,
  body,
  icon: Icon,
  index,
}: {
  title: MessageDescriptor;
  body: MessageDescriptor;
  icon: typeof Upload;
  index: number;
}) {
  return (
    <MotionListItem
      data-motion-reveal
      className={cn(
        "group/feature relative flex flex-col py-10 lg:border-r",
        index === 0 && "lg:border-l",
      )}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.5, delay: index * 0.15, ease: EASE }}
    >
      <div className="pointer-events-none absolute inset-0 size-full bg-linear-to-t from-muted to-transparent opacity-0 transition duration-200 group-hover/feature:opacity-100" />
      <div className="relative z-10 mb-4 px-10 text-muted-foreground transition duration-200 group-hover/feature:scale-101 group-hover/feature:text-primary">
        <Icon />
      </div>
      <div className="relative z-10 mb-2 px-10 text-lg font-bold">
        <div className="absolute inset-y-0 left-0 h-6 w-1 origin-center rounded-tr-full rounded-br-full bg-border transition-colors duration-200 group-hover/feature:bg-primary" />
        <span className="inline-block transition duration-200 group-hover/feature:translate-x-2">
          {i18n._(title)}
        </span>
      </div>
      <p className="relative z-10 max-w-xs px-10 text-sm text-muted-foreground">
        {i18n._(body)}
      </p>
    </MotionListItem>
  );
}

function ProductShowcases() {
  return (
    <section id="product" className="pt-24 sm:pt-32">
      <SectionIntro title={COPY.productTitle} body={COPY.productBody} />
      <div className="space-y-6">
        <MotionDiv
          data-motion-reveal
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <Card
            id="game-analysis"
            className="group h-full border transition-shadow duration-300 hover:shadow-lg"
          >
            <CardContent className="grid items-center gap-8 p-6 lg:grid-cols-5 lg:p-8">
              <div className="lg:col-span-2">
                <Badge variant="outline" className="mb-4">
                  {i18n._(COPY.gameAnalysis)}
                </Badge>
                <h2 className="mb-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {i18n._(COPY.analysisTitle)}
                </h2>
                <p className="text-lg leading-8 text-muted-foreground">
                  {i18n._(COPY.analysisBody)}
                </p>
                <a
                  href={PRODUCT_URL}
                  className={buttonVariants({
                    className: "mt-8 rounded-full",
                    variant: "outline",
                  })}
                >
                  {i18n._(COPY.inspectGames)}
                  <ArrowRight data-icon="inline-end" />
                </a>
              </div>
              <picture className="block lg:col-span-3">
                <source
                  media="(max-width: 40rem)"
                  srcSet="/product/game-analysis-640.webp"
                />
                <source
                  media="(max-width: 48rem)"
                  srcSet="/product/game-analysis-768.webp"
                />
                <Image
                  src="/product/game-analysis.webp"
                  alt={i18n._(COPY.analysisAlt)}
                  width={1440}
                  height={900}
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="w-full rounded-md border shadow-lg"
                />
              </picture>
            </CardContent>
          </Card>
        </MotionDiv>

        <MotionDiv
          data-motion-reveal
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
        >
          <Card
            id="drill"
            className="group h-full border transition-shadow duration-300 hover:shadow-lg"
          >
            <CardContent className="grid items-center gap-8 p-6 lg:grid-cols-5 lg:p-8">
              <div className="lg:order-2 lg:col-span-2">
                <Badge variant="outline" className="mb-4">
                  {i18n._(COPY.drill)}
                </Badge>
                <h2 className="mb-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {i18n._(COPY.drillTitle)}
                </h2>
                <p className="text-lg leading-8 text-muted-foreground">
                  {i18n._(COPY.drillBody)}
                </p>
                <a
                  href={PRODUCT_URL}
                  className={buttonVariants({
                    className: "mt-8 rounded-full",
                    variant: "outline",
                  })}
                >
                  {i18n._(COPY.startDrilling)}
                  <ArrowRight data-icon="inline-end" />
                </a>
              </div>
              <picture className="block lg:order-1 lg:col-span-3">
                <source media="(max-width: 40rem)" srcSet="/product/drill-640.webp" />
                <source media="(max-width: 48rem)" srcSet="/product/drill-768.webp" />
                <Image
                  src="/product/drill.webp"
                  alt={i18n._(COPY.drillAlt)}
                  width={1440}
                  height={900}
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="w-full rounded-md border shadow-lg"
                />
              </picture>
            </CardContent>
          </Card>
        </MotionDiv>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="rounded-xl border bg-muted/40 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <Badge variant="outline" className="mb-4">
          {i18n._(COPY.publicBeta)}
        </Badge>
        <h2 className="mb-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {i18n._(COPY.finalTitle)}
        </h2>
        <p className="mb-8 text-lg text-muted-foreground">{i18n._(COPY.finalBody)}</p>
        <div className="flex justify-center">
          <ShimmerButton
            render={<a href={PRODUCT_URL} aria-label={i18n._(COPY.tryVelaChess)} />}
            className="h-11 gap-2"
          >
            {i18n._(COPY.tryVelaChess)}
            <ArrowRight className="size-4" />
          </ShimmerButton>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="col-span-1">
            <a
              href="#top"
              className="mb-4 flex items-center gap-2"
              aria-label={i18n._(COPY.brand)}
            >
              <VelaChessMark className="size-8" />
              <span className="font-display text-xl font-bold">{i18n._(COPY.brand)}</span>
            </a>
            <p className="text-sm text-muted-foreground">{i18n._(COPY.footerBody)}</p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title.id} aria-label={i18n._(group.title)}>
              <h3 className="mb-4 text-sm font-semibold">{i18n._(group.title)}</h3>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {i18n._(link.label)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t pt-8 text-center">
          <p className="text-sm text-muted-foreground">{i18n._(COPY.copyright)}</p>
        </div>
      </div>
    </footer>
  );
}

function SectionIntro({
  title,
  body,
}: {
  title: MessageDescriptor;
  body: MessageDescriptor;
}) {
  return (
    <MotionDiv
      data-motion-reveal
      className="mb-16 text-center"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <h2 className="mb-4 font-display text-4xl font-bold md:text-5xl">
        {i18n._(title)}
      </h2>
      <p className="mx-auto max-w-3xl text-lg text-muted-foreground md:text-xl">
        {i18n._(body)}
      </p>
    </MotionDiv>
  );
}
