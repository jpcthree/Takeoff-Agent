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
  X,
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

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

function formatRoof(roofType: string, roofMaterial: string, aiMaterial?: string): string {
  const parts: string[] = [];
  const material = roofMaterial && roofMaterial !== 'unknown'
    ? roofMaterial.replace(/_/g, ' ')
    : null;
  const type = roofType && roofType !== 'unknown'
    ? roofType.replace(/_/g, ' ')
    : null;
  if (material) parts.push(material);
  if (type) parts.push(type);
  if (aiMaterial && aiMaterial !== material?.replace(/ /g, '_')) {
    parts.push(`(AI: ${aiMaterial.replace(/_/g, ' ')})`);
  }
  return parts.length > 0 ? parts.join(' · ') : '';
}

function PropertyHero({ propertyData, images, roofClassification }: PropertyHeroProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState('');
  const [lightboxAlt, setLightboxAlt] = useState('');

  const streetView = images?.street_view || images?.street;
  const satellite = images?.satellite;
  const heroImage = streetView || satellite;

  const openLightbox = (src: string, alt: string) => {
    setLightboxSrc(src);
    setLightboxAlt(alt);
    setLightboxOpen(true);
  };

  // ── Build property detail bullets ──────────────────────────────────
  const bullets: string[] = [];

  // Foundation / Basement
  const basement = propertyData.basement;
  const hasBasement = basement && basement !== 'none' && basement !== 'unknown';
  const foundation = propertyData.foundation_type;
  const hasFoundation = foundation && foundation !== 'unknown';
  if (hasBasement) {
    const bsmtLabel = basement.replace(/_/g, ' ');
    const bsmtSqft = propertyData.basement_sqft
      ? ` (${propertyData.basement_sqft.toLocaleString()} SF)`
      : '';
    bullets.push(`Foundation: ${bsmtLabel} basement${bsmtSqft}`);
  } else if (hasFoundation) {
    bullets.push(`Foundation: ${foundation.replace(/_/g, ' ')}`);
  }

  // Roof
  const roofStr = formatRoof(
    propertyData.roof_type,
    propertyData.roof_material,
    roofClassification?.material,
  );
  if (roofStr) {
    bullets.push(`Roof: ${roofStr}`);
  }

  // Roof pitch
  if (propertyData.roof_pitch_deg > 0) {
    // Convert degrees to standard pitch (rise per 12 run)
    const rise = Math.tan((propertyData.roof_pitch_deg * Math.PI) / 180) * 12;
    bullets.push(`Roof Pitch: ${rise.toFixed(1)}/12 (${propertyData.roof_pitch_deg.toFixed(1)}°)`);
  }

  // Lot size
  if (propertyData.lot_sqft && propertyData.lot_sqft > 0) {
    const acres = propertyData.lot_sqft / 43560;
    bullets.push(
      acres >= 0.5
        ? `Lot: ${acres.toFixed(2)} acres (${propertyData.lot_sqft.toLocaleString()} SF)`
        : `Lot: ${propertyData.lot_sqft.toLocaleString()} SF`,
    );
  }

  // Estimated market value (ATTOM market value preferred, assessed value as fallback)
  if (propertyData.estimated_value > 0) {
    bullets.push(`Est. Market Value: ${formatCurrency(propertyData.estimated_value)}`);
  } else if (propertyData.total_value > 0) {
    bullets.push(`Est. Market Value: ${formatCurrency(propertyData.total_value)}`);
  }

  // Last sale
  if (propertyData.last_sale_price > 0 || propertyData.last_sale_date) {
    const parts: string[] = [];
    if (propertyData.last_sale_price > 0) parts.push(formatCurrency(propertyData.last_sale_price));
    if (propertyData.last_sale_date) parts.push(`on ${propertyData.last_sale_date}`);
    bullets.push(`Last Sale: ${parts.join(' ')}`);
  }

  // Determine layout: side-by-side when both images, full-width when one, placeholder when none
  const hasBothImages = !!streetView && !!satellite;
  const hasSingleImage = !!heroImage && !hasBothImages;

  return (
    <div className="bg-white">
      {/* Image section */}
      {hasBothImages ? (
        /* ── Side-by-side layout ─────────────────────────────────────── */
        <div className="flex w-full h-[360px]">
          {/* Street View — left half */}
          <div className="relative flex-1 bg-gray-200 overflow-hidden cursor-pointer group"
            onClick={() => openLightbox(streetView!, 'Street view')}
          >
            <img
              src={streetView!}
              alt="Street view"
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-3 left-4 pointer-events-none">
              <span className="text-xs font-medium text-white/80 bg-black/30 px-2 py-1 rounded">Street View</span>
            </div>
          </div>
          {/* Satellite — right half */}
          <div className="relative flex-1 bg-gray-200 overflow-hidden cursor-pointer group border-l-2 border-white"
            onClick={() => openLightbox(satellite!, 'Satellite view')}
          >
            <img
              src={satellite!}
              alt="Satellite view"
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-3 left-4 pointer-events-none">
              <span className="text-xs font-medium text-white/80 bg-black/30 px-2 py-1 rounded">Satellite</span>
            </div>
          </div>
        </div>
      ) : hasSingleImage ? (
        /* ── Single image full-width ─────────────────────────────────── */
        <div className="relative w-full h-[360px] bg-gray-200 overflow-hidden cursor-pointer"
          onClick={() => openLightbox(heroImage!, streetView ? 'Street view' : 'Satellite view')}
        >
          <img
            src={heroImage!}
            alt={streetView ? 'Street view' : 'Satellite view'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
        </div>
      ) : (
        /* ── No images placeholder ───────────────────────────────────── */
        <div className="w-full h-[200px] flex flex-col items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-white">
          <Home className="h-12 w-12 text-slate-400 mb-3" />
          <p className="text-lg font-semibold text-slate-300">{propertyData.address}</p>
          <p className="text-xs text-slate-500 mt-1">No property images available</p>
        </div>
      )}

      {/* Address bar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-gray-400 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 truncate">
            {propertyData.address}
          </h2>
        </div>
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

      {/* Property Details — clean bullet list */}
      {bullets.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-200">
          <ul className="space-y-1.5">
            {bullets.map((bullet, idx) => {
              const [label, ...rest] = bullet.split(': ');
              const value = rest.join(': ');
              return (
                <li key={idx} className="flex text-sm text-gray-700">
                  <span className="text-gray-400 mr-2">•</span>
                  <span>
                    <span className="font-medium text-gray-900">{label}:</span>{' '}
                    <span className="capitalize">{value}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={lightboxSrc}
            alt={lightboxAlt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export { PropertyHero };
