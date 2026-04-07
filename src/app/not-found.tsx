import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="font-accent text-6xl font-semibold text-gold">404</p>
      <h1 className="font-heading text-2xl font-bold">Pagina nu a fost găsită</h1>
      <p className="text-muted-foreground">Pagina pe care o cauți nu există sau a fost mutată.</p>
      <Link href="/">
        <Button className="bg-gold text-background hover:bg-gold-dark">
          Înapoi la pagina principală
        </Button>
      </Link>
    </div>
  );
}
