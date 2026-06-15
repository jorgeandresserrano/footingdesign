"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const SECTIONS = [
  { id: "card-geometry", label: "Geometry" },
  { id: "card-materials", label: "Materials" },
  { id: "card-reinforcement", label: "Reinforcement" },
  { id: "card-loads", label: "Loads" },
  { id: "card-design-checks", label: "Design checks" },
  { id: "card-values", label: "Values" },
];

export function TableOfContents() {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-10% 0px -80% 0px", threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2 pb-1">
        Contents
      </p>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="flex items-center gap-1.5 text-left text-sm px-2 py-1 rounded-lg transition-colors text-gray-400 hover:bg-gray-100 hover:text-gray-600 mb-0.5"
      >
        <ArrowUp size={13} />
        Top
      </button>
      <div className="border-t border-gray-100 mb-0.5" />
      {SECTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => scrollTo(id)}
          className={`text-left text-sm px-2 py-1 rounded-lg transition-colors ${
            active === id
              ? "bg-blue-50 text-blue-700 font-medium"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
