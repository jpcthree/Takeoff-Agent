'use client';

import React from 'react';
import { Building2, Layers, Home, Ruler, Mountain, SquareStack, Users } from 'lucide-react';
import { useProjectStore } from '@/hooks/useProjectStore';

// ---------------------------------------------------------------------------
// Helpers for reading the opaque BuildingModel dict
// ---------------------------------------------------------------------------

function get<T>(obj: Record<string, unknown>, path: string, fallback: T): T {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return fallback;
    current = (current as Record<string, unknown>)[part];
  }
  return (current as T) ?? fallback;
}

function dimToFeet(dim: unknown): number {
  if (dim == null || typeof dim !== 'object') return 0;
  const d = dim as Record<string, number>;
  return (d.feet || 0) + ((d.inches || 0) / 12);
}

function dimToString(dim: unknown): string {
  if (dim == null || typeof dim !== 'object') return '—';
  const d = dim as Record<string, number>;
  const feet = d.feet || 0;
  const inches = d.inches || 0;
  if (feet === 0 && inches === 0) return '—';
  if (inches === 0) return `${feet}'-0"`;
  return `${feet}'-${inches}"`;
}

function cleanLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-primary">{icon}</div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{String(value)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function ProjectDescriptionPanel() {
  const { state } = useProjectStore();
  const bm = state.buildingModel;
  const meta = state.projectMeta;

  if (!bm) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 p-8">
        <Building2 className="h-12 w-12" />
        <p className="text-sm">No building model available yet.</p>
        <p className="text-xs">Upload and analyze blueprint plans to see project details here.</p>
      </div>
    );
  }

  // Extract data from BuildingModel
  const projectName = get(bm, 'project_name', '') || meta.name;
  const projectAddress = get(bm, 'project_address', '') || meta.address;
  const buildingType = get(bm, 'building_type', meta.buildingType || 'residential');
  const stories = get(bm, 'stories', 1);
  const totalSqft = get(bm, 'sqft', 0);
  const climateZone = get(bm, 'climate_zone', '');
  const ieccEdition = get(bm, 'iecc_code_edition', '');

  // Rooms
  const rooms = get<unknown[]>(bm, 'rooms', []);
  type RoomData = {
    name: string;
    floor: number;
    length: unknown;
    width: unknown;
    height: unknown;
    ceiling_type: string;
    floor_finish: string;
    is_garage: boolean;
  };

  // Floor areas
  const floorAreas: Record<number, number> = {};
  for (const r of rooms) {
    const room = r as Record<string, unknown>;
    const floor = (room.floor as number) || 1;
    const l = dimToFeet(room.length);
    const w = dimToFeet(room.width);
    const area = l * w;
    floorAreas[floor] = (floorAreas[floor] || 0) + area;
  }

  // Walls
  const walls = get<unknown[]>(bm, 'walls', []);
  const extWalls = walls.filter((w: unknown) => (w as Record<string, unknown>).is_exterior === true);
  const intWalls = walls.filter((w: unknown) => (w as Record<string, unknown>).is_exterior !== true);
  const totalExtLF = extWalls.reduce((sum: number, w: unknown) => sum + dimToFeet((w as Record<string, unknown>).length), 0);
  const totalIntLF = intWalls.reduce((sum: number, w: unknown) => sum + dimToFeet((w as Record<string, unknown>).length), 0);

  // Roof
  const roofStyle = get(bm, 'roof.style', '');
  const roofMaterial = get(bm, 'roof.material', '');
  const roofPitch = get(bm, 'roof.pitch', 0);
  const roofArea = get(bm, 'roof.total_area_sf', 0);
  const roofSections = get<unknown[]>(bm, 'roof.sections', []);

  // Foundation
  const foundationType = get(bm, 'foundation.type', '');
  const foundationArea = get(bm, 'foundation.area_sf', 0);
  const foundationPerimeter = get(bm, 'foundation.perimeter_lf', 0);

  // Project Team
  const projectTeam = get<unknown[]>(bm, 'project_team', []);
  type TeamMember = {
    role: string;
    name: string;
    company?: string;
    license?: string;
    phone?: string;
    email?: string;
  };

  // Openings
  const openings = get<unknown[]>(bm, 'openings', []);
  const windows = openings.filter((o: unknown) => {
    const type = (o as Record<string, unknown>).opening_type as string;
    return type === 'window';
  });
  const doors = openings.filter((o: unknown) => {
    const type = (o as Record<string, unknown>).opening_type as string;
    return type === 'door' || type === 'sliding_door' || type === 'garage_door';
  });

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4">
      {/* Project Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h1 className="text-lg font-bold text-gray-900">{projectName || 'Untitled Project'}</h1>
        {projectAddress && (
          <p className="text-sm text-gray-500 mt-1">{projectAddress}</p>
        )}
        <div className="flex gap-4 mt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            <Building2 className="h-3 w-3" />
            {cleanLabel(buildingType)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
            <Layers className="h-3 w-3" />
            {stories} {stories === 1 ? 'Story' : 'Stories'}
          </span>
          {totalSqft > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
              <Ruler className="h-3 w-3" />
              {totalSqft.toLocaleString()} SF
            </span>
          )}
          {climateZone && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
              Climate Zone {climateZone}
              {ieccEdition && ` (IECC ${ieccEdition})`}
            </span>
          )}
        </div>
      </div>

      {/* Project Team */}
      {projectTeam.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-primary"><Users className="h-4 w-4" /></div>
            <h3 className="text-sm font-semibold text-gray-800">Project Team</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {projectTeam.map((member: unknown, idx: number) => {
              const m = member as TeamMember;
              return (
                <div key={idx} className="flex flex-col gap-0.5 bg-gray-50 rounded-lg p-3">
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">{m.role}</span>
                  <span className="text-sm font-medium text-gray-900">{m.name}</span>
                  {m.company && <span className="text-xs text-gray-500">{m.company}</span>}
                  {m.license && <span className="text-xs text-gray-400">{m.license}</span>}
                  {m.phone && <span className="text-xs text-gray-400">{m.phone}</span>}
                  {m.email && <span className="text-xs text-gray-400">{m.email}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid of summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">

        {/* Area Summary */}
        <SectionCard title="Area Summary" icon={<SquareStack className="h-4 w-4" />}>
          {totalSqft > 0 && <StatRow label="Total Area" value={`${totalSqft.toLocaleString()} SF`} />}
          {Object.keys(floorAreas).sort().map((floor) => (
            <StatRow
              key={floor}
              label={`Floor ${floor}`}
              value={`${Math.round(floorAreas[parseInt(floor)]).toLocaleString()} SF`}
            />
          ))}
          <StatRow label="Rooms" value={rooms.length} />
          <StatRow
            label="Windows / Doors"
            value={`${windows.length} / ${doors.length}`}
          />
        </SectionCard>

        {/* Roof Summary */}
        {(roofStyle || roofArea > 0) && (
          <SectionCard title="Roof" icon={<Mountain className="h-4 w-4" />}>
            {roofStyle && <StatRow label="Style" value={cleanLabel(roofStyle)} />}
            {roofMaterial && <StatRow label="Material" value={cleanLabel(roofMaterial)} />}
            {roofPitch > 0 && <StatRow label="Pitch" value={`${roofPitch}/12`} />}
            {roofArea > 0 && <StatRow label="Total Area" value={`${roofArea.toLocaleString()} SF`} />}
            {roofSections.length > 0 && <StatRow label="Sections" value={roofSections.length} />}
            {get(bm, 'chimney_count', 0) > 0 && <StatRow label="Chimneys" value={get(bm, 'chimney_count', 0)} />}
            {get(bm, 'skylight_count', 0) > 0 && <StatRow label="Skylights" value={get(bm, 'skylight_count', 0)} />}
          </SectionCard>
        )}

        {/* Foundation Summary */}
        {foundationType && (
          <SectionCard title="Foundation" icon={<Home className="h-4 w-4" />}>
            <StatRow label="Type" value={cleanLabel(foundationType)} />
            {foundationArea > 0 && <StatRow label="Area" value={`${foundationArea.toLocaleString()} SF`} />}
            {foundationPerimeter > 0 && <StatRow label="Perimeter" value={`${foundationPerimeter.toLocaleString()} LF`} />}
            {get(bm, 'crawlspace_area', 0) > 0 && (
              <StatRow label="Crawlspace" value={`${get(bm, 'crawlspace_area', 0).toLocaleString()} SF`} />
            )}
          </SectionCard>
        )}

        {/* Wall Summary */}
        {walls.length > 0 && (
          <SectionCard title="Walls" icon={<Layers className="h-4 w-4" />}>
            <StatRow label="Exterior Walls" value={extWalls.length} />
            <StatRow label="Exterior LF" value={`${Math.round(totalExtLF).toLocaleString()} LF`} />
            <StatRow label="Interior Walls" value={intWalls.length} />
            <StatRow label="Interior LF" value={`${Math.round(totalIntLF).toLocaleString()} LF`} />
            {(() => {
              const thicknesses = new Set(walls.map((w: unknown) => (w as Record<string, unknown>).thickness).filter(Boolean));
              return thicknesses.size > 0 ? <StatRow label="Framing" value={Array.from(thicknesses).join(', ')} /> : null;
            })()}
          </SectionCard>
        )}
      </div>

      {/* Room Breakdown Table */}
      {rooms.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Room Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600">Room</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Floor</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Dimensions</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Area (SF)</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Ceiling Ht</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Ceiling Type</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Floor Finish</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r: unknown, idx: number) => {
                  const room = r as RoomData;
                  const l = dimToFeet(room.length);
                  const w = dimToFeet(room.width);
                  const area = l * w;
                  return (
                    <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{room.name || `Room ${idx + 1}`}</td>
                      <td className="px-3 py-2 text-gray-600">{room.floor || 1}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {dimToString(room.length)} x {dimToString(room.width)}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-right">
                        {area > 0 ? Math.round(area).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{dimToString(room.height)}</td>
                      <td className="px-3 py-2 text-gray-600">{room.ceiling_type ? cleanLabel(room.ceiling_type) : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{room.floor_finish ? cleanLabel(room.floor_finish) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export { ProjectDescriptionPanel };
