"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Eye, MapPin, Users, Star } from "lucide-react";
import Link from "next/link";

const demoVenues = [
  { id: 1, nameRo: "Restaurant Codru", slug: "restaurant-codru", city: "Chișinău", capacityMax: 300, pricePerPerson: 35, isActive: true, isFeatured: true, ratingAvg: 4.6 },
  { id: 2, nameRo: "Chateau Vartely Events", slug: "chateau-vartely-events", city: "Orhei", capacityMax: 500, pricePerPerson: 45, isActive: true, isFeatured: true, ratingAvg: 4.8 },
  { id: 3, nameRo: "La Plăcinte Ceremonie", slug: "la-placinte-ceremonie", city: "Chișinău", capacityMax: 150, pricePerPerson: 25, isActive: true, isFeatured: true, ratingAvg: 4.3 },
];

export default function AdminVenuesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Săli & Restaurante</h1>
          <p className="text-sm text-muted-foreground">{demoVenues.length} săli</p>
        </div>
        <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Plus className="h-4 w-4" /> Adaugă Sală</Button>
      </div>

      <div className="space-y-2">
        {demoVenues.map((venue) => (
          <Card key={venue.id} className="transition-all hover:border-gold/30">
            <CardContent className="flex items-center gap-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-lg">🏛️</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{venue.nameRo}</span>
                  {venue.isFeatured && <Badge className="bg-gold/10 text-gold border-gold/30 text-xs">Featured</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {venue.city}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> max {venue.capacityMax}</span>
                  <span>{venue.pricePerPerson}€/pers</span>
                  <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" /> {venue.ratingAvg}</span>
                </div>
              </div>
              <Switch checked={venue.isActive} />
              <Link href={`/sali/${venue.slug}`} target="_blank"><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></Link>
              <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
