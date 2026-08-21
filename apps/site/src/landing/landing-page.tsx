import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Badge } from "@velachess/ui/components/badge";
import { buttonVariants } from "@velachess/ui/components/button";
import { Separator } from "@velachess/ui/components/separator";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  Dumbbell,
  GitFork,
  Lightbulb,
  Menu,
  Repeat2,
  ScanSearch,
  Upload,
  VelaChessMark,
} from "@velachess/ui/icons";
import Image from "next/image";

import { i18n } from "../shared/i18n.ts";

const PRODUCT_URL = "https://app.velachess.com";
const SIGN_IN_URL = "https://app.velachess.com/login";
const GITHUB_URL = "https://github.com/velachess/velachess";
const CONTRIBUTE_URL = `${GITHUB_URL}/blob/main/CONTRIBUTING.md`;
const SELF_HOST_URL = `${GITHUB_URL}/blob/main/docs/how-to/self-host.md`;

const COPY = {
  brand: msg`VelaChess`,
  product: msg`Product`,
  howItWorks: msg`How it works`,
  openSource: msg`Open Source`,
  signIn: msg`Sign in`,
  tryVelaChess: msg`Try VelaChess`,
  viewGitHub: msg`View on GitHub`,
  publicBeta: msg`Public Beta`,
  heroTitle: msg`Turn your games into training.`,
  heroBody: msg`Import your Chess.com and Lichess games. VelaChess finds recurring mistakes and opening weaknesses, then turns them into training built from the games you actually play.`,
  analysisEyebrow: msg`Game Analysis`,
  analysisTitle: msg`See the moment the game changed.`,
  analysisBody: msg`Walk through every move with Stockfish evaluation, clear move classification, and the better continuation shown on the board.`,
  analysisAlt: msg`VelaChess game analysis showing a blunder on move two`,
  workflowEyebrow: msg`From archive to training`,
  workflowTitle: msg`One loop, grounded in your games.`,
  importTitle: msg`Import`,
  importBody: msg`Connect Chess.com or Lichess and bring your games together.`,
  analyzeTitle: msg`Analyze`,
  analyzeBody: msg`Stockfish grades the choices that changed your winning chances.`,
  understandTitle: msg`Understand`,
  understandBody: msg`Spot recurring mistakes and weaknesses in the openings you play.`,
  trainTitle: msg`Train`,
  trainBody: msg`Solve those positions again on a schedule that adapts to you.`,
  drillEyebrow: msg`Personalized Drill`,
  drillTitle: msg`The analysis becomes a training loop.`,
  drillBody: msg`Replay positions from your own mistakes, get immediate feedback, and let the next review arrive when it is useful.`,
  drillAlt: msg`VelaChess drill showing feedback and the next review date`,
  capabilitiesEyebrow: msg`Built for improvement`,
  capabilitiesTitle: msg`Keep the useful parts of every game.`,
  repertoireTitle: msg`Your opening repertoire`,
  repertoireBody: msg`Learn where your real games leave the lines you rely on.`,
  patternsTitle: msg`Recurring mistakes`,
  patternsBody: msg`Turn isolated engine verdicts into patterns you can recognize.`,
  schedulingTitle: msg`Training that comes back`,
  schedulingBody: msg`Use spaced review to retain the corrections that matter.`,
  ownGamesTitle: msg`Evidence from your own play`,
  ownGamesBody: msg`Prioritize positions you reached, not a generic puzzle feed.`,
  openEyebrow: msg`Open source by design`,
  openTitle: msg`Transparent training you can trust.`,
  openBody: msg`VelaChess is open source, Stockfish-powered, and self-hostable. Inspect how your games are analyzed, run it yourself, or contribute to the project.`,
  openProject: msg`Open source`,
  selfHostable: msg`Self-hostable`,
  stockfishPowered: msg`Stockfish-powered`,
  transparentLogic: msg`Transparent training logic`,
  contributions: msg`Contributions welcome`,
  viewProject: msg`View VelaChess on GitHub`,
  contribute: msg`Contribute`,
  selfHost: msg`Self-host`,
  finalEyebrow: msg`Public Beta`,
  finalTitle: msg`Train on the games you actually play.`,
  finalBody: msg`Connect an account and turn your next mistake into a position you will remember.`,
  menu: msg`Open navigation`,
  githubProject: msg`GitHub project`,
  footerBody: msg`Personalized chess training from your own games.`,
  copyright: msg`VelaChess. Open-source chess training.`,
} as const;

const NAVIGATION = [
  { href: "#product", label: COPY.product },
  { href: "#how-it-works", label: COPY.howItWorks },
  { href: "#open-source", label: COPY.openSource },
] as const;

const WORKFLOW = [
  { title: COPY.importTitle, body: COPY.importBody, icon: Upload },
  { title: COPY.analyzeTitle, body: COPY.analyzeBody, icon: ScanSearch },
  { title: COPY.understandTitle, body: COPY.understandBody, icon: Lightbulb },
  { title: COPY.trainTitle, body: COPY.trainBody, icon: Dumbbell },
] as const;

const CAPABILITIES = [
  { title: COPY.repertoireTitle, body: COPY.repertoireBody, icon: BookOpen },
  { title: COPY.patternsTitle, body: COPY.patternsBody, icon: BrainCircuit },
  { title: COPY.schedulingTitle, body: COPY.schedulingBody, icon: Repeat2 },
  { title: COPY.ownGamesTitle, body: COPY.ownGamesBody, icon: ScanSearch },
] as const;

const OPEN_SOURCE_PROOFS = [
  COPY.openProject,
  COPY.selfHostable,
  COPY.stockfishPowered,
  COPY.transparentLogic,
  COPY.contributions,
] as const;

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <ProductAnalysis />
        <DrillShowcase />
        <Workflow />
        <Capabilities />
        <OpenSource />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Brand />

        <nav aria-label={i18n._(COPY.menu)} className="hidden items-center gap-8 md:flex">
          {NAVIGATION.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {i18n._(item.label)}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a href={SIGN_IN_URL} className={buttonVariants({ variant: "ghost" })}>
            {i18n._(COPY.signIn)}
          </a>
          <a href={PRODUCT_URL} className={buttonVariants()}>
            {i18n._(COPY.tryVelaChess)}
            <ArrowRight data-icon="inline-end" />
          </a>
        </div>

        <MobileNavigation />
      </div>
    </header>
  );
}

function MobileNavigation() {
  return (
    <details className="group relative md:hidden">
      <summary
        aria-label={i18n._(COPY.menu)}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border bg-background hover:bg-muted"
      >
        <Menu className="size-4" />
      </summary>
      <nav className="absolute right-0 mt-2 flex w-64 flex-col gap-1 rounded-lg border bg-popover p-2 shadow-md">
        {NAVIGATION.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            {i18n._(item.label)}
          </a>
        ))}
        <Separator className="my-1" />
        <a href={SIGN_IN_URL} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
          {i18n._(COPY.signIn)}
        </a>
        <a href={PRODUCT_URL} className={buttonVariants({ className: "mt-1" })}>
          {i18n._(COPY.tryVelaChess)}
        </a>
      </nav>
    </details>
  );
}

function Brand() {
  return (
    <a href="#top" className="flex items-center gap-2" aria-label={i18n._(COPY.brand)}>
      <VelaChessMark className="size-8" />
      <span className="font-display text-lg font-semibold">{i18n._(COPY.brand)}</span>
    </a>
  );
}

function Hero() {
  return (
    <section id="top" className="border-b">
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        <Badge
          variant="outline"
          className="mb-6 border-brand/40 bg-brand/10 text-foreground"
        >
          <span className="size-1.5 rounded-full bg-guidance" />
          {i18n._(COPY.publicBeta)}
        </Badge>
        <h1 className="font-display text-5xl leading-tight font-semibold sm:text-6xl lg:text-7xl">
          {i18n._(COPY.heroTitle)}
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
          {i18n._(COPY.heroBody)}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={PRODUCT_URL} className={buttonVariants({ size: "lg" })}>
            {i18n._(COPY.tryVelaChess)}
            <ArrowRight data-icon="inline-end" />
          </a>
          <a
            href={GITHUB_URL}
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            <GitFork data-icon="inline-start" />
            {i18n._(COPY.viewGitHub)}
          </a>
        </div>
      </div>
    </section>
  );
}

function ProductAnalysis() {
  return (
    <section id="product" className="border-b py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={COPY.analysisEyebrow}
          title={COPY.analysisTitle}
          body={COPY.analysisBody}
        />
        <ProductFrame>
          <Image
            src="/product/game-analysis.webp"
            alt={i18n._(COPY.analysisAlt)}
            width={1440}
            height={900}
            priority
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="h-auto w-full"
          />
        </ProductFrame>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section id="how-it-works" className="border-b py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={COPY.workflowEyebrow} title={COPY.workflowTitle} />
        <ol className="mt-12 grid border-y sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW.map((step, index) => (
            <li
              key={step.title.id}
              className="border-b p-6 last:border-b-0 sm:border-r lg:border-b-0"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">
                  {i18n.number(index + 1, { minimumIntegerDigits: 2 })}
                </span>
                <step.icon className="size-5 text-brand" />
              </div>
              <h3 className="mt-8 text-lg font-medium">{i18n._(step.title)}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {i18n._(step.body)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DrillShowcase() {
  return (
    <section className="border-b py-16 sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <SectionHeading
            eyebrow={COPY.drillEyebrow}
            title={COPY.drillTitle}
            body={COPY.drillBody}
          />
        </div>
        <div className="lg:col-span-3">
          <ProductFrame>
            <Image
              src="/product/drill.webp"
              alt={i18n._(COPY.drillAlt)}
              width={1440}
              height={900}
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="h-auto w-full"
            />
          </ProductFrame>
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section className="border-b py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={COPY.capabilitiesEyebrow}
          title={COPY.capabilitiesTitle}
        />
        <div className="mt-12 grid border-t md:grid-cols-2">
          {CAPABILITIES.map((capability) => (
            <article
              key={capability.title.id}
              className="flex gap-4 border-b p-6 md:even:border-l"
            >
              <capability.icon className="mt-1 size-5 shrink-0 text-info" />
              <div>
                <h3 className="font-medium">{i18n._(capability.title)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {i18n._(capability.body)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function OpenSource() {
  return (
    <section id="open-source" className="border-b bg-card py-16 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <SectionHeading
          eyebrow={COPY.openEyebrow}
          title={COPY.openTitle}
          body={COPY.openBody}
        />
        <div className="flex flex-col justify-center">
          <ul className="grid gap-4 sm:grid-cols-2">
            {OPEN_SOURCE_PROOFS.map((proof) => (
              <li key={proof.id} className="flex items-center gap-3 text-sm">
                <span className="flex size-6 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="size-4" />
                </span>
                {i18n._(proof)}
              </li>
            ))}
          </ul>
          <a
            href={GITHUB_URL}
            className={buttonVariants({
              className: "mt-8 self-start",
              variant: "outline",
            })}
          >
            <GitFork data-icon="inline-start" />
            {i18n._(COPY.viewProject)}
          </a>
          <div className="mt-4 flex gap-5 text-sm">
            <a
              href={CONTRIBUTE_URL}
              className="text-muted-foreground hover:text-foreground"
            >
              {i18n._(COPY.contribute)}
            </a>
            <a
              href={SELF_HOST_URL}
              className="text-muted-foreground hover:text-foreground"
            >
              {i18n._(COPY.selfHost)}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <p className="font-mono text-xs uppercase text-guidance">
          {i18n._(COPY.finalEyebrow)}
        </p>
        <h2 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">
          {i18n._(COPY.finalTitle)}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          {i18n._(COPY.finalBody)}
        </p>
        <a
          href={PRODUCT_URL}
          className={buttonVariants({ className: "mt-8", size: "lg" })}
        >
          {i18n._(COPY.tryVelaChess)}
          <ArrowRight data-icon="inline-end" />
        </a>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <Brand />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            {i18n._(COPY.footerBody)}
          </p>
        </div>
        <nav className="flex flex-col gap-2 text-sm">
          {NAVIGATION.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {i18n._(item.label)}
            </a>
          ))}
        </nav>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <a
            href={GITHUB_URL}
            aria-label={i18n._(COPY.githubProject)}
            className="text-muted-foreground hover:text-foreground"
          >
            <GitFork className="size-5" />
          </a>
          <p className="text-xs text-muted-foreground">{i18n._(COPY.copyright)}</p>
        </div>
      </div>
    </footer>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: MessageDescriptor;
  title: MessageDescriptor;
  body?: MessageDescriptor;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-xs uppercase text-brand">{i18n._(eyebrow)}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
        {i18n._(title)}
      </h2>
      {body !== undefined && (
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{i18n._(body)}</p>
      )}
    </div>
  );
}

function ProductFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 overflow-hidden rounded-lg border border-border-strong bg-card p-2 shadow-2xl shadow-black/30">
      <div className="overflow-hidden rounded-md border bg-background">{children}</div>
    </div>
  );
}
