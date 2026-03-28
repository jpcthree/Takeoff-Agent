'use client';

import React, { useEffect, useState } from 'react';
import {
  Home,
  MapPin,
  Calendar,
  Ruler,
  Layers,
  BedDouble,
  Bath,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useProjectStore } from '@/hooks/useProjectStore';
import { useAddressEstimate } from '@/hooks/useAddressEstimate';

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
        <div className="text-sm font-medium text-gray-900 truncate">{value}</div>
      </div>
    </div>
  );
}

function PropertyInfoPanel() {
  const { state } = useProjectStore();
  const { runEstimate, isRunning } = useAddressEstimate();
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  const {
    propertyData,
    propertyImages,
    assumptions,
    roofClassification,
    analysisStatus,
    analysisMessages,
    error,
    projectMeta,
  } = state;

  // Auto-trigger estimate on mount if we have an address but no data yet
  useEffect(() => {
    if (
      !hasTriggered &&
      projectMeta.address &&
      !propertyData &&
      analysisStatus === 'idle'
    ) {
      setHasTriggered(true);
      runEstimate(projectMeta.address);
    }
  }, [hasTriggered, projectMeta.address, propertyData, analysisStatus, runEstimate]);

  // Loading state
  if (isRunning || analysisStatus === 'analyzing' || analysisStatus === 'uploading') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Generating Estimate</h3>
        <div className="space-y-1 w-full max-w-[260px]">
          {analysisMessages.map((msg, i) => (
            <p key={i} className="text-xs text-gray-500 animate-fade-in">{msg}</p>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mb-4" />
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Estimate Failed</h3>
        <p className="text-xs text-red-600 mb-4">{error}</p>
        {projectMeta.address && (
          <button
            onClick={() => runEstimate(projectMeta.address)}
            className="text-xs text-primary hover:text-primary/80 font-medium cursor-pointer"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  // No data yet (idle, no address)
  if (!propertyData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Home className="h-10 w-10 text-gray-300 mb-4" />
        <h3 className="text-sm font-semibold text-gray-700 mb-1">No property data</h3>
        <p className="text-xs text-gray-500">Enter an address to generate an estimate.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto custom-scrollbar">
      {/* Property Images */}
      <div className="p-3 space-y-2 border-b border-gray-200">
        {propertyImages?.street && (
          <div className="rounded-lg overflow-hidden">
            <img
              src={propertyImages.street}
              alt="Street view"
              className="w-full h-auto object-cover"
            />
          </div>
        )}
        {propertyImages?.satellite && (
          <div className="rounded-lg overflow-hidden">
            <img
              src={propertyImages.satellite}
              alt="Satellite view"
              className="w-full h-auto object-cover"
            />
          </div>
        )}
      </div>

      {/* Property Summary */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {propertyData.address}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {propertyData.year_built && (
            <StatCard icon={Calendar} label="Year Built" value={String(propertyData.year_built)} />
          )}
          {propertyData.total_sqft && (
            <StatCard icon={Ruler} label="Total SF" value={propertyData.total_sqft.toLocaleString()} />
          )}
          <StatCard icon={Layers} label="Stories" value={String(propertyData.stories)} />
          <StatCard icon={BedDouble} label="Bedrooms" value={String(propertyData.bedrooms)} />
          <StatCard icon={Bath} label="Bathrooms" value={String(propertyData.bathrooms)} />
          <StatCard icon={Home} label="Foundation" value={propertyData.foundation_type || 'Unknown'} />
        </div>
      </div>

      {/* Roof Classification */}
      {roofClassification && Object.keys(roofClassification).length > 0 && (
        <div className="p-3 border-b border-gray-200">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Roof</h4>
          <div className="space-y-1">
            {Object.entries(roofClassification).map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="text-gray-900 font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assumptions */}
      {assumptions && assumptions.length > 0 && (
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={() => setAssumptionsOpen(!assumptionsOpen)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide cursor-pointer w-full"
          >
            {assumptionsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Assumptions ({assumptions.length})
          </button>
          {assumptionsOpen && (
            <ul className="mt-2 space-y-1">
              {assumptions.map((a, i) => (
                <li key={i} className="text-xs text-gray-600 pl-5 relative before:content-['•'] before:absolute before:left-1.5 before:text-gray-400">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Property value */}
      {propertyData.total_value > 0 && (
        <div className="p-3">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Valuation</h4>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Total Value</span>
              <span className="text-gray-900 font-medium">${propertyData.total_value.toLocaleString()}</span>
            </div>
            {propertyData.land_value > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Land Value</span>
                <span className="text-gray-900 font-medium">${propertyData.land_value.toLocaleString()}</span>
              </div>
            )}
            {propertyData.improvement_value > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Improvement Value</span>
                <span className="text-gray-900 font-medium">${propertyData.improvement_value.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { PropertyInfoPanel };
