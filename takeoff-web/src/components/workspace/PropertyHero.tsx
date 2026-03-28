'use client';

import React from 'react';
import {
  MapPin,
  Calendar,
  Ruler,
  Layers,
  BedDouble,
  Bath,
  Home,
  DollarSign,
  Building,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import type { PropertyInfo } from '@/lib/api/python-service';

interface PropertyHeroProps {
  propertyData: PropertyInfo;
  images: Record<string, string | null>;
  roofClassification?: Record<string, string>;
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

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wider leading-none mb-0.5">{label}</div>
        <div className="text-sm text-gray-800">{value}</div>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

function PropertyHero({ propertyData, images, roofClassification }: PropertyHeroProps) {
  const streetView = images?.street_view || images?.street;
  const satellite = images?.satellite;
  // Use satellite as hero fallback when street view is missing
  const heroImage = streetView || satellite;

  const hasBasement = propertyData.basement && propertyData.basement !== 'none' && propertyData.basement !== 'unknown';
  const hasFoundation = propertyData.foundation_type && propertyData.foundation_type !== 'unknown';
  const hasRoofType = propertyData.roof_type && propertyData.roof_type !== 'unknown';
  const hasRoofMaterial = propertyData.roof_material && propertyData.roof_material !== 'unknown';
  const hasSaleDate = propertyData.last_sale_date && propertyData.last_sale_date !== '';
  const hasSalePrice = propertyData.last_sale_price > 0;
  const hasValue = propertyData.total_value > 0;

  // Check if we have any details to show
  const hasDetails = hasBasement || hasFoundation || hasRoofType || hasRoofMaterial || hasSaleDate || hasValue;

  return (
    <div className="bg-white">
      {/* Hero image section */}
      <div className="relative w-full h-[280px] bg-gray-200 overflow-hidden">
        {heroImage ? (
          <img
            src={heroImage}
            alt={streetView ? 'Street view' : 'Satellite view'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-white">
            <Home className="h-12 w-12 text-slate-400 mb-3" />
            <p className="text-lg font-semibold text-slate-300">{propertyData.address}</p>
            <p className="text-xs text-slate-500 mt-1">No property images available</p>
          </div>
        )}

        {/* Gradient overlay (only when we have an image) */}
        {heroImage && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        )}

        {/* Address overlay */}
        {heroImage && (
          <div className="absolute bottom-4 left-5 right-5">
            <div className="flex items-center gap-2 text-white">
              <MapPin className="h-5 w-5 shrink-0" />
              <h2 className="text-xl font-bold truncate drop-shadow-md">
                {propertyData.address}
              </h2>
            </div>
          </div>
        )}

        {/* Satellite thumbnail (only if street view is the hero) */}
        {streetView && satellite && (
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
          {propertyData.year_built ? (
            <StatPill icon={Calendar} label="Year Built" value={String(propertyData.year_built)} />
          ) : null}
          {propertyData.total_sqft ? (
            <StatPill icon={Ruler} label="Total SF" value={propertyData.total_sqft.toLocaleString()} />
          ) : null}
          <StatPill icon={Layers} label="Stories" value={String(propertyData.stories)} />
          <StatPill icon={BedDouble} label="Beds" value={String(propertyData.bedrooms)} />
          <StatPill icon={Bath} label="Baths" value={String(propertyData.bathrooms)} />
        </div>
      </div>

      {/* Property Details */}
      {hasDetails && (
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1">
            {hasFoundation && (
              <DetailRow icon={Building} label="Foundation" value={propertyData.foundation_type} />
            )}
            {hasBasement && (
              <DetailRow
                icon={Building}
                label="Basement"
                value={
                  propertyData.basement_sqft
                    ? `${propertyData.basement} (${propertyData.basement_sqft.toLocaleString()} SF)`
                    : propertyData.basement
                }
              />
            )}
            {(hasRoofType || hasRoofMaterial) && (
              <DetailRow
                icon={Home}
                label="Roof"
                value={[
                  hasRoofType ? propertyData.roof_type : null,
                  hasRoofMaterial ? propertyData.roof_material : null,
                  roofClassification?.material ? `(AI: ${roofClassification.material})` : null,
                ].filter(Boolean).join(' — ')}
              />
            )}
            {hasValue && (
              <DetailRow icon={Landmark} label="Assessed Value" value={formatCurrency(propertyData.total_value)} />
            )}
            {(hasSaleDate || hasSalePrice) && (
              <DetailRow
                icon={DollarSign}
                label="Last Sale"
                value={[
                  hasSalePrice ? formatCurrency(propertyData.last_sale_price) : null,
                  hasSaleDate ? propertyData.last_sale_date : null,
                ].filter(Boolean).join(' on ')}
              />
            )}
            {propertyData.sources && Object.keys(propertyData.sources).length > 0 && (
              <DetailRow
                icon={ShieldCheck}
                label="Data Sources"
                value={[...new Set(Object.values(propertyData.sources))].join(', ')}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { PropertyHero };
