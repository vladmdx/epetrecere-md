"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Calendar, Award, Building2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatDef {
  icon: LucideIcon;
  key: string;
  suffix: string;
  label: string;
  fallback: number;
}

const statDefs: StatDef[] = [
  { icon: Users, key: "artists", suffix: "+", label: "Artiști", fallback: 500 },
  { icon: Building2, key: "venues", suffix: "+", label: "Săli", fallback: 10 },
  { icon: Calendar, key: "events", suffix: "+", label: "Solicitări", fallback: 200 },
  { icon: Award, key: "clients", suffix: "+", label: "Clienți", fallback: 1500 },
];

function useCountUp(target: number, duration = 2000, trigger: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!trigger || target === 0) {
      if (trigger) setCount(0);
      return;
    }
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, trigger]);

  return count;
}

function StatItem({
  icon: Icon,
  value,
  suffix,
  label,
}: {
  icon: LucideIcon;
  value: number;
  suffix: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const count = useCountUp(value, 2000, visible);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-gold" />
      <p className="font-accent text-4xl font-semibold text-gold md:text-5xl">
        {count}
        {suffix}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function StatsCounterSection() {
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setValues(data);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="bg-card py-20 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src="/images/backgrounds/concert-lights.jpg"
          alt=""
          className="w-full h-full object-cover opacity-[0.06] blur-[2px] parallax-bg"
          loading="lazy"
        />
      </div>
      <div className="relative z-10 mx-auto max-w-5xl px-4 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {statDefs.map((stat) => (
            <StatItem
              key={stat.label}
              icon={stat.icon}
              value={values[stat.key] ?? stat.fallback}
              suffix={stat.suffix}
              label={stat.label}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
