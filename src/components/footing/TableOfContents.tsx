"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const SHORT_LABEL: Record<string, string> = {
  "frost-depth": "Frost depth",
  "service-bearing": "Service bearing",
  "soil-contact": "Soil contact",
  "service-sliding": "Service sliding",
  "factored-bearing": "Factored bearing",
  "overturning-x": "Overturning X",
  "overturning-z": "Overturning Z",
  "service-settlement": "Settlement",
  "service-rotation-x": "Rotation X",
  "service-rotation-z": "Rotation Z",
  "effective-depth": "Effective depth",
  "minimum-steel-x": "Min. steel X",
  "minimum-steel-z": "Min. steel Z",
  "flexure-x": "Flexure X",
  "flexure-z": "Flexure Z",
  "ductility-x": "Ductility X",
  "ductility-z": "Ductility Z",
  "one-way-shear-x": "One-way shear X",
  "one-way-shear-z": "One-way shear Z",
  "punching-shear": "Punching shear",
  "vertical-torsion": "Torsion T",
};

const SECTIONS = [
  { id: "card-geometry", label: "Geometry" },
  { id: "card-materials", label: "Materials" },
  { id: "card-reinforcement", label: "Reinforcement" },
  { id: "card-loads", label: "Loads" },
  { id: "card-design-checks", label: "Design checks" },
  { id: "card-values", label: "Values" },
];

interface CheckItem {
  id: string;
  label: string;
}

interface TableOfContentsProps {
  checks?: CheckItem[];
}

export function TableOfContents({ checks }: TableOfContentsProps) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const allIds = [
      ...SECTIONS.map((s) => s.id),
      ...(checks ?? []).map((c) => `check-${c.id}`),
    ];

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

    allIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [checks]);

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const inDesignChecks =
    active === "card-design-checks" ||
    (checks ?? []).some((c) => `check-${c.id}` === active);

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
        <div key={id}>
          <button
            type="button"
            onClick={() => scrollTo(id)}
            className={`w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${
              active === id || (id === "card-design-checks" && inDesignChecks)
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
          {id === "card-design-checks" && checks && checks.length > 0 && (
            <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
              {checks.map((check) => (
                <button
                  key={check.id}
                  type="button"
                  onClick={() => scrollTo(`check-${check.id}`)}
                  className={`text-left text-xs px-2 py-0.5 rounded-md transition-colors ${
                    active === `check-${check.id}`
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  {SHORT_LABEL[check.id] ?? check.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
