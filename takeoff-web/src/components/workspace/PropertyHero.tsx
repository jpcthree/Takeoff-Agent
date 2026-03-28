'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Calendar,
  Ruler,
  Layers,
  BedDouble,
  Bath,
  Home,
  ChevronDown,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import type { PropertyInfo } from '@/lib/api/python-service';

interface PropertyHeroProps {
  propertyData: PropertyInfo;
  images: Record<string, string | null>;
  roofClassification?: Record<string, string>;
  assumptions?: string[];
}

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2.5 shadow-sm border border-gray-100">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wider leading-none mb-0.5">{label}</div>
        <div className="text-sm font-semibold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function PropertyHero({ propertyData, images, roofClassification, assumptions }: PropertyHeroProps) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const streetView = images?.street_view || images?.street;
  const satellite = images?.satellite;

  return (
    <div className="bg-white">
      {/* Hero image section */}
      <div className="relative w-full h-[280px] bg-gray-200 overflow-hidden">
        {streetView ? (
          <img
            src={streetView}
            alt="Street view"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <Home className="h-16 w-16 text-gray-300" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Address overlay */}
        <div className="absolute bottom-4 left-5 right-5">
          <div className="flex items-center gap-2 text-white">
            <MapPin className="h-5 w-5 shrink-0" />
            <h2 className="text-xl font-bold truncate drop-shadow-md">
              {propertyData.address}
            </h2>
          </div>
        </div>

        {/* Satellite thumbnail */}
        {satellite && (
          <div className="absolute top-3 right-3 w-24 h-24 rounded-lg overflow-hidden border-2 border-white shadow-lg">
            <img
              src={satellite}
              alt="Satellite view"
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex flex-wrap gap-3">
          {propertyData.year_built && (
            <StatPill icon={Calendar} label="Year Built" value={String(propertyData.year_built)} />
          )}
          {propertyData.total_sqft && (
            <StatPill icon={Ruler} label="Total SF" value={propertyData.total_sqft.toLocaleString()} />
          )}
          <StatPill icon={Layers} label="Stories" value={String(propertyData.stories)} />
          <StatPill icon={BedDouble} label="Beds" value={String(propertyData.bedrooms)} />
          <StatPill icon={Bath} label="Baths" value={String(propertyData.bathrooms)} />
          <StatPill icon={Home} label="Foundation" value={propertyData.foundation_type || 'Unknown'} />

          {/* Roof */}
          {roofClassification?.material && (
            <StatPill icon={Home} label="Roof" value={roofClassification.material} />
          )}

          {/* Valuation */}
          {propertyData.total_value > 0 && (
            <StatPill
              icon={DollarSign}
              label="Value"
              value={`$${propertyData.total_value.toLocaleString()}`}
            />
          )}
        </div>
      </div>

      {/* Assumptions (collapsible) */}
      {assumptions && assumptions.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-200">
          <button
            onClick={() => setAssumptionsOpen(!assumptionsOpen)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
          >
            {assumptionsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Assumptions ({assumptions.length})
          </button>
          {assumptionsOpen && (
            <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
              {assumptions.map((a, i) => (
                <li
                  key={i}
                  className="text-xs text-gray-600 pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400"
                >
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export { PropertyHero };
