import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, CalendarDays, Check, Maximize2 } from "lucide-react";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import { metaForPath } from "@/lib/seo/page-meta";
import { guideCopy, type GuideStepId } from "./content";

const GUIDE_IMAGES = {
  plan: ["planificare", 1120, 648],
  requests: ["alege-artisti", 688, 554],
  dashboard: ["panoul-meu", 1120, 648],
  confirm: ["rezervarile-mele", 1120, 760],
  checklist: ["checklist", 1120, 648],
} as const satisfies Record<GuideStepId, readonly [string, number, number]>;

const PLANNING_STEPS = ["plan", "requests"] as const;
const CABINET_STEPS = ["dashboard", "confirm", "checklist"] as const;
const primaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#e6bf64] px-5 py-2.5 text-sm font-bold text-[#20170b] transition-colors hover:bg-[#f6d681]";
const secondaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/25 px-5 py-2.5 text-sm font-bold text-[#fbf7ec] transition-colors hover:bg-white/10";

type PageProps = { params: Promise<{ locale: string }> };
type Copy = (typeof guideCopy)[keyof typeof guideCopy];

function resolveLocale(raw: string) {
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export async function generateMetadata({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const copy = guideCopy[locale];
  return metaForPath("/cum-functioneaza", {
    title: copy.pageTitle,
    description: copy.metaDescription,
  }, locale);
}

function BookingStatuses({ copy }: { copy: Copy }) {
  return (
    <div className="mt-5">
      <ol className="space-y-2.5">
        {copy.statuses.map((status, index) => (
          <li key={status.title} className="flex gap-3 text-sm">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${index === 2 ? "bg-[#367451]" : "bg-[#a07835]"}`}
            />
            <p>
              <strong className="font-bold text-[#2b2220]">{status.title}.</strong>{" "}
              <span className="text-[#564b44]">{status.description}</span>
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-l-2 border-[#b18742] pl-3 text-sm leading-relaxed text-[#564b44]">
        {copy.venueConfirmation}
      </p>
    </div>
  );
}

function GuideStep({
  id,
  number,
  copy,
  cabinetHref,
  bookingsHref,
}: {
  id: GuideStepId;
  number: number;
  copy: Copy;
  cabinetHref: string;
  bookingsHref: string;
}) {
  const step = copy.steps[id];
  const [image, width, height] = GUIDE_IMAGES[id];
  const imageSrc = `/images/how-it-works/${image}.webp`;

  return (
    <li className="grid min-w-0 items-center gap-6 border-t border-[#dcd2be] py-8 first:border-0 first:pt-0 sm:py-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12 lg:py-12">
      <div>
        <span aria-hidden="true" className="font-heading text-3xl font-semibold leading-none text-[#85612a]">
          {String(number).padStart(2, "0")}
        </span>
        <h3 className="mt-2 font-heading text-3xl font-bold leading-tight text-[#211b22] sm:text-4xl">
          {step.title}
        </h3>
        <p className="mt-3 leading-relaxed text-[#514741]">{step.description}</p>
        {step.points && (
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-[#514741]">
            {step.points.map((point) => (
              <li key={point} className="flex gap-2.5">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#85612a]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
        {id === "confirm" && <BookingStatuses copy={copy} />}
        {(id === "dashboard" || id === "confirm") && (
          <Link
            prefetch={false}
            href={id === "dashboard" ? cabinetHref : bookingsHref}
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#654514] underline-offset-4 hover:underline"
          >
            {id === "dashboard" ? copy.openCabinet : copy.openBookings}
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        )}
      </div>

      <figure className="min-w-0 overflow-hidden rounded-2xl border border-[#dcd2be] bg-[#fffcf5] shadow-[0_16px_42px_rgba(61,45,23,.09)]">
        <a
          href={imageSrc}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${copy.openImage} · ${step.caption}`}
          className="group relative block bg-[#14131c] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4"
        >
          <Image
            src={imageSrc}
            width={width}
            height={height}
            alt={step.imageAlt}
            unoptimized
            className="h-auto w-full"
          />
          <span className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-lg border border-white/20 bg-[#111018] text-white transition-colors group-hover:bg-[#3a2d1b]">
            <Maximize2 aria-hidden="true" className="size-4" />
          </span>
        </a>
        <figcaption className="flex flex-wrap justify-between gap-x-5 gap-y-1 px-4 py-3 text-xs text-[#5e534a]">
          <span className="font-semibold text-[#312925]">{step.caption}</span>
          <span>{copy.demo}</span>
        </figcaption>
      </figure>
    </li>
  );
}

export default async function HowItWorksPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const copy = guideCopy[locale];
  const plannerHref = localizePath("/planifica", locale);
  const cabinetHref = localizePath("/cabinet", locale);
  const bookingsHref = localizePath("/cabinet/rezervari", locale);

  return (
    <div className="bg-[#faf6ed] text-[#211b22]">
      <section aria-labelledby="guide-title" className="relative isolate overflow-hidden bg-[#15131c] text-[#fcf7ed]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_78%_15%,#3b2b27_0%,transparent_58%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:py-20">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#f0ce83]">{copy.pageTitle}</p>
            <h1 id="guide-title" className="max-w-[13ch] font-heading text-[clamp(3rem,6.5vw,5.6rem)] font-bold leading-[0.94]">
              {copy.headline}{" "}
              <span className="text-[#f0ce83]">{copy.headlineAccent}</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[#ded6ce] sm:text-lg">{copy.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={plannerHref} prefetch={false} className={primaryButton}>
                <CalendarDays aria-hidden="true" className="size-4 shrink-0" /> {copy.startPlanning}
              </Link>
              <a href="#ghid-planificare" className={secondaryButton}>
                {copy.readGuide} <ArrowDown aria-hidden="true" className="size-4 shrink-0" />
              </a>
            </div>
          </div>
          <div className="relative aspect-[16/10] overflow-hidden rounded-[1.35rem] border border-[#bc9455]/40 shadow-[0_24px_55px_rgba(0,0,0,.32)] lg:aspect-[6/5]">
            <Image
              src="/images/redesign/home/home-feature-planner.webp"
              alt=""
              fill
              priority
              unoptimized
              className="object-cover object-center"
            />
          </div>
        </div>
      </section>

      <section id="ghid-planificare" aria-labelledby="guide-planning" className="scroll-mt-20">
        <div className="mx-auto max-w-7xl px-5 pb-2 pt-10 sm:px-8 sm:pt-14">
          <h2 id="guide-planning" className="mb-7 font-heading text-4xl font-bold leading-tight sm:mb-10 sm:text-5xl">{copy.planningTitle}</h2>
          <ol role="list">
            {PLANNING_STEPS.map((id, index) => (
              <GuideStep key={id} id={id} number={index + 1} copy={copy} cabinetHref={cabinetHref} bookingsHref={bookingsHref} />
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="guide-organization" className="border-y border-[#dcd2be] bg-[#f0e9da]">
        <div className="mx-auto max-w-7xl px-5 pb-2 pt-10 sm:px-8 sm:pt-14">
          <h2 id="guide-organization" className="mb-7 max-w-3xl font-heading text-4xl font-bold leading-tight sm:mb-10 sm:text-5xl">{copy.organizationTitle}</h2>
          <ol start={PLANNING_STEPS.length + 1} role="list">
            {CABINET_STEPS.map((id, index) => (
              <GuideStep key={id} id={id} number={PLANNING_STEPS.length + index + 1} copy={copy} cabinetHref={cabinetHref} bookingsHref={bookingsHref} />
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="guide-start" className="bg-[#15131c] text-[#fcf7ed]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 sm:px-8 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="guide-start" className="font-heading text-4xl font-bold leading-tight sm:text-5xl">{copy.finishTitle}</h2>
            <p className="mt-2 max-w-xl leading-relaxed text-[#ded6ce]">{copy.finishDescription}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href={plannerHref} prefetch={false} className={primaryButton}>
              {copy.startPlanning} <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
            <Link href={cabinetHref} prefetch={false} className={secondaryButton}>{copy.openCabinet}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
