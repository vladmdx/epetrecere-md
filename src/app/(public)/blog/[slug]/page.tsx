import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Tag, Edit } from "lucide-react";
import { auth } from "@clerk/nextjs/server";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  const [post] = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);

  if (!post) {
    // Try matching by partial slug from demo posts
    const demoPosts: Record<string, { title: string; content: string; category: string; date: string; image: string }> = {
      "top-10-artisti-nunti": {
        title: "Top 10 Artiști pentru Nunți în 2026",
        content: `<p>Planificarea nunții perfecte începe cu alegerea artiștilor potriviți. Iată topul nostru pentru 2026:</p>
<h2>1. Formații Live</h2>
<p>O formație live aduce o energie unică evenimentului. Cele mai populare formații din Moldova oferă un repertoriu variat, de la muzică populară la hits internaționale.</p>
<h2>2. DJ Profesioniști</h2>
<p>Un DJ bun știe exact cum să mențină atmosfera pe tot parcursul serii. Recomandăm să alegeți un DJ cu experiență în nunți.</p>
<h2>3. Cântăreți de Estradă</h2>
<p>Vocea live a unui cântăreț profesionist poate transforma complet atmosfera nunții voastre.</p>
<h2>4. Moderatori</h2>
<p>Un moderator carismatic este cheia unei nunți reușite. El coordonează toate momentele importante ale serii.</p>
<h2>5. Show Program</h2>
<p>De la dansatori profesioniști la artiști de circ — show programul adaugă momente memorabile.</p>`,
        category: "Nunți",
        date: "15 Martie 2026",
        image: "/images/blog-wedding.jpg",
      },
      "cum-sa-alegi-sala": {
        title: "Cum Să Alegi Sala Perfectă pentru Eveniment",
        content: `<p>Alegerea sălii este una dintre cele mai importante decizii în organizarea unui eveniment. Iată ghidul nostru complet:</p>
<h2>Capacitatea</h2>
<p>Asigurați-vă că sala poate găzdui confortabil toți invitații. O regulă bună: adăugați 10-15% la numărul confirmat de invitați.</p>
<h2>Locația</h2>
<p>Alegeți o locație accesibilă pentru majoritatea invitaților. Verificați și opțiunile de parcare.</p>
<h2>Meniul</h2>
<p>Gustați meniul înainte de a semna contractul. Discutați opțiunile pentru invitații cu restricții alimentare.</p>
<h2>Decorațiunile</h2>
<p>Verificați ce include pachetul de bază și ce trebuie adăugat separat. Unele săli oferă decorațiuni incluse în preț.</p>
<h2>Bugetul</h2>
<p>Comparați prețurile per persoană și ce include fiecare pachet. Nu uitați de taxele suplimentare.</p>`,
        category: "Sfaturi",
        date: "20 Februarie 2026",
        image: "/images/blog-decor.jpg",
      },
      "tendinte-muzicale-2026": {
        title: "Tendințe Muzicale pentru Evenimente în 2026",
        content: `<p>Muzica este sufletul oricărui eveniment. Descoperă tendințele muzicale care vor domina în 2026:</p>
<h2>Mix de Genuri</h2>
<p>Tendința principală este combinarea genurilor muzicale. De la pop și dance la muzică populară moldovenească — varietatea este cheia.</p>
<h2>Live Bands cu Elemente Electronice</h2>
<p>Formațiile moderne integrează sintetizatoare și efecte electronice în interpretările live, creând un sound unic.</p>
<h2>Muzică Ambientală pentru Cocktail</h2>
<p>Tot mai mulți organizatori aleg muzică ambientală pentru recepția de cocktail, trecând la muzică energică pentru petrecere.</p>
<h2>Playlist-uri Personalizate</h2>
<p>DJ-ii profesioniști creează playlist-uri personalizate bazate pe preferințele mirelui și miresei.</p>`,
        category: "Tendințe",
        date: "10 Ianuarie 2026",
        image: "/images/blog-party.jpg",
      },
    };

    const demo = demoPosts[slug];
    if (!demo) notFound();

    const { userId } = await auth();

    return (
      <div className="min-h-screen">
        <div className="relative h-[40vh] overflow-hidden">
          <img src={demo.image} alt={demo.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3 text-sm text-[#D4D4E0] mb-3">
                <span className="text-gold font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> {demo.category}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {demo.date}</span>
              </div>
              <h1 className="font-heading text-3xl font-bold text-white md:text-4xl">{demo.title}</h1>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-gold transition-colors">
              <ArrowLeft className="h-4 w-4" /> Înapoi la pagina principală
            </Link>
            {userId && (
              <Link href="/admin/blog/new" className="ml-auto flex items-center gap-2 text-sm text-gold hover:text-gold-dark transition-colors">
                <Edit className="h-4 w-4" /> Editează în admin
              </Link>
            )}
          </div>
          <article
            className="prose prose-invert prose-gold max-w-none prose-headings:font-heading prose-headings:text-gold prose-p:text-[#D4D4E0] prose-a:text-gold"
            dangerouslySetInnerHTML={{ __html: demo.content }}
          />
        </div>
      </div>
    );
  }

  // Real blog post from DB
  const { userId } = await auth();

  return (
    <div className="min-h-screen">
      {post.coverImageUrl && (
        <div className="relative h-[40vh] overflow-hidden">
          <img src={post.coverImageUrl} alt={post.titleRo} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3 text-sm text-[#D4D4E0] mb-3">
                {post.category && (
                  <>
                    <span className="text-gold font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> {post.category}</span>
                    <span>·</span>
                  </>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("ro-RO") : new Date(post.createdAt).toLocaleDateString("ro-RO")}
                </span>
              </div>
              <h1 className="font-heading text-3xl font-bold text-white md:text-4xl">{post.titleRo}</h1>
            </div>
          </div>
        </div>
      )}

      {!post.coverImageUrl && (
        <div className="pt-24 pb-8 section-navy">
          <div className="mx-auto max-w-3xl px-4">
            <div className="flex items-center gap-3 text-sm text-[#D4D4E0] mb-3">
              {post.category && (
                <>
                  <span className="text-gold font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> {post.category}</span>
                  <span>·</span>
                </>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("ro-RO") : new Date(post.createdAt).toLocaleDateString("ro-RO")}
              </span>
            </div>
            <h1 className="font-heading text-3xl font-bold md:text-4xl">{post.titleRo}</h1>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-gold transition-colors">
            <ArrowLeft className="h-4 w-4" /> Înapoi la pagina principală
          </Link>
          {userId && (
            <Link href={`/admin/blog/${post.id}`} className="ml-auto flex items-center gap-2 text-sm text-gold hover:text-gold-dark transition-colors">
              <Edit className="h-4 w-4" /> Editează în admin
            </Link>
          )}
        </div>
        {post.contentRo ? (
          <article
            className="prose prose-invert prose-gold max-w-none prose-headings:font-heading prose-headings:text-gold prose-p:text-[#D4D4E0] prose-a:text-gold"
            dangerouslySetInnerHTML={{ __html: post.contentRo }}
          />
        ) : (
          <p className="text-muted-foreground">Conținutul articolului nu este disponibil momentan.</p>
        )}
      </div>
    </div>
  );
}
