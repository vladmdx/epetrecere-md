"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Calendar, Award, Clock } from "lucide-react";

const stats = [
  { icon: Users, value: 500, suffix: "+", label: "Artiști" },
  { icon: Calendar, value: 200, suffix: "+", label: "Evenimente" },
  { icon: Award, value: 1500, suffix: "+", label: "Clienți Mulțumiți" },
  { icon: Clock, value: 12, suffix: "", label: "Ani Experiență" },
];

function useCountUp(target: number, duration = 2000, trigger: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!trigger) return;
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

function StatItem({ icon: Icon, value, suffix, label }: typeof stats[0]) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const count = useCountUp(value, 2000, visible);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-gold" />
      <p className="font-accent text-4xl font-semibold text-gold md:text-5xl">
        {count}{suffix}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function StatsCounterSection() {
  return (
    <section className="bg-card py-20">
      <div className="mx-auto max-w-5xl px-4 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <StatItem key={stat.label} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
