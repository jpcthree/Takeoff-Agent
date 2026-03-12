'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  RotateCcw,
  Download,
  Upload,
  Save,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/* ---------- Types ---------- */
interface CostItem {
  unit: string;
  cost: number;
  coverage_note?: string;
}

type CostSection = Record<string, CostItem>;

interface CostsData {
  metadata: {
    region: string;
    year: number;
    currency: string;
    notes: string;
  };
  labor_rates: Record<string, number>;
  [section: string]: CostSection | Record<string, number> | CostsData['metadata'];
}

/* ---------- Helpers ---------- */
const TRADE_SECTIONS = [
  'labor_rates',
  'framing',
  'insulation',
  'drywall',
  'roofing',
  'gutters',
  'hvac',
  'electrical',
  'plumbing',
  'exterior',
  'interior_finishes',
] as const;

const TRADE_LABELS: Record<string, string> = {
  labor_rates: 'Labor Rates',
  framing: 'Framing',
  insulation: 'Insulation',
  drywall: 'Drywall',
  roofing: 'Roofing',
  gutters: 'Gutters & Downspouts',
  hvac: 'HVAC',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  exterior: 'Exterior',
  interior_finishes: 'Interior Finishes',
};

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bSf\b/g, 'SF')
    .replace(/\bLf\b/g, 'LF')
    .replace(/\bBtu\b/g, 'BTU')
    .replace(/\bPvc\b/g, 'PVC')
    .replace(/\bPex\b/g, 'PEX')
    .replace(/\bNm\b/g, 'NM')
    .replace(/\bMdf\b/g, 'MDF')
    .replace(/\bLvl\b/g, 'LVL')
    .replace(/\bTji\b/g, 'TJI')
    .replace(/\bOsb\b/g, 'OSB')
    .replace(/\bXps\b/g, 'XPS')
    .replace(/\bGfci\b/g, 'GFCI')
    .replace(/\bAfci\b/g, 'AFCI')
    .replace(/\bUsb\b/g, 'USB')
    .replace(/\bCo\b/g, 'CO')
    .replace(/\bEmt\b/g, 'EMT')
    .replace(/\bLvp\b/g, 'LVP')
    .replace(/\bPva\b/g, 'PVA')
    .replace(/\bCdx\b/g, 'CDX')
    .replace(/\bTg\b/g, 'T&G');
}

/* ---------- Editable Cell ---------- */
function EditableCell({
  value,
  onChange,
  isCurrency,
}: {
  value: number;
  onChange: (val: number) => void;
  isCurrency: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value.toString());
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(Math.round(parsed * 100) / 100);
    } else {
      setDraft(value.toString());
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value.toString());
            setEditing(false);
          }
        }}
        className="w-24 px-2 py-1 text-sm text-right border border-primary/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-24 px-2 py-1 text-sm text-right rounded cursor-pointer hover:bg-orange-50 transition-colors"
      style={{ backgroundColor: '#FFF2CC' }}
    >
      {isCurrency ? `$${value.toFixed(2)}` : value.toFixed(2)}
    </button>
  );
}

/* ---------- Trade Section ---------- */
function TradeSection({
  name,
  label,
  data,
  defaultData,
  onChange,
  searchQuery,
}: {
  name: string;
  label: string;
  data: CostSection | Record<string, number>;
  defaultData: CostSection | Record<string, number>;
  onChange: (key: string, value: number) => void;
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLaborRates = name === 'labor_rates';

  const entries = Object.entries(data);
  const filteredEntries = searchQuery
    ? entries.filter(([key]) =>
        formatKey(key).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  // Count modified items
  const modifiedCount = entries.filter(([key, val]) => {
    const defaultVal = (defaultData as Record<string, unknown>)[key];
    if (isLaborRates) {
      return val !== defaultVal;
    }
    return (val as CostItem).cost !== (defaultVal as CostItem)?.cost;
  }).length;

  // Auto-expand if search matches
  useEffect(() => {
    if (searchQuery && filteredEntries.length > 0) {
      setExpanded(true);
    }
  }, [searchQuery, filteredEntries.length]);

  if (searchQuery && filteredEntries.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Section Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          )}
          <span className="text-sm font-semibold text-gray-900">{label}</span>
          <span className="text-xs text-gray-500">
            ({filteredEntries.length} item{filteredEntries.length !== 1 ? 's' : ''})
          </span>
          {modifiedCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              {modifiedCount} modified
            </span>
          )}
        </div>
      </button>

      {/* Section Content */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {/* Column Headers */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50/50 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-5">Item</div>
            {!isLaborRates && <div className="col-span-2">Unit</div>}
            <div className={isLaborRates ? 'col-span-3 text-right' : 'col-span-2 text-right'}>
              {isLaborRates ? 'Hourly Rate' : 'Unit Cost'}
            </div>
            {!isLaborRates && <div className="col-span-3 text-xs font-normal normal-case text-gray-400">Notes</div>}
          </div>

          {/* Items */}
          {filteredEntries.map(([key, val]) => {
            const isModified = isLaborRates
              ? val !== (defaultData as Record<string, number>)[key]
              : (val as CostItem).cost !== (defaultData as CostSection)[key]?.cost;

            return (
              <div
                key={key}
                className={`grid grid-cols-12 gap-2 px-4 py-2 items-center text-sm ${
                  isModified ? 'bg-amber-50/50' : ''
                }`}
              >
                <div className="col-span-5 text-gray-800 font-medium truncate" title={formatKey(key)}>
                  {formatKey(key)}
                </div>
                {!isLaborRates && (
                  <div className="col-span-2 text-gray-500 text-xs">
                    {(val as CostItem).unit}
                  </div>
                )}
                <div className={isLaborRates ? 'col-span-3 flex justify-end' : 'col-span-2 flex justify-end'}>
                  <EditableCell
                    value={isLaborRates ? (val as number) : (val as CostItem).cost}
                    onChange={(newVal) => onChange(key, newVal)}
                    isCurrency={true}
                  />
                </div>
                {!isLaborRates && (
                  <div className="col-span-3 text-xs text-gray-400 truncate" title={(val as CostItem).coverage_note}>
                    {(val as CostItem).coverage_note || ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Main Editor ---------- */
export function CostDatabaseEditor() {
  const [costs, setCosts] = useState<CostsData | null>(null);
  const [defaultCosts, setDefaultCosts] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Load costs
  useEffect(() => {
    loadCosts();
  }, []);

  const loadCosts = async () => {
    setLoading(true);
    try {
      // Load from Next.js API route (reads config/default_costs.json server-side)
      const res = await fetch('/api/costs');
      if (res.ok) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // Check for saved custom costs in localStorage
        const savedCosts = localStorage.getItem('takeoff_custom_costs');
        if (savedCosts) {
          try {
            setCosts(JSON.parse(savedCosts));
          } catch {
            setCosts(structuredClone(data));
          }
        } else {
          setCosts(structuredClone(data));
        }
        setDefaultCosts(structuredClone(data));
      } else {
        throw new Error('Failed to load costs');
      }
    } catch {
      console.warn('Could not load cost database');
      setCosts(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCostChange = useCallback(
    (section: string, key: string, value: number) => {
      setCosts((prev) => {
        if (!prev) return prev;
        const updated = structuredClone(prev);
        if (section === 'labor_rates') {
          (updated.labor_rates as Record<string, number>)[key] = value;
        } else {
          const sec = updated[section] as CostSection;
          if (sec[key]) {
            sec[key] = { ...sec[key], cost: value };
          }
        }
        return updated;
      });
      setHasChanges(true);
      setSaved(false);
    },
    []
  );

  const handleSave = async () => {
    if (!costs) return;
    setSaving(true);
    try {
      localStorage.setItem('takeoff_custom_costs', JSON.stringify(costs));
      setHasChanges(false);
      setSaved(true);
      toast('success', 'Cost database saved successfully');
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    if (!defaultCosts) return;
    if (!confirm('Reset all costs to national average defaults? Your customizations will be lost.')) return;
    setCosts(structuredClone(defaultCosts));
    setHasChanges(true);
    setSaved(false);
    toast('info', 'Costs reset to defaults. Click Save to persist.');
  };

  const handleExport = () => {
    if (!costs) return;
    const blob = new Blob([JSON.stringify(costs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cost_profile_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', 'Cost profile exported');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (data.labor_rates && data.framing) {
          setCosts(data);
          setHasChanges(true);
          setSaved(false);
          toast('success', 'Cost profile imported. Click Save to persist.');
        } else {
          toast('error', 'Invalid cost profile format. Missing required sections.');
        }
      } catch {
        toast('error', 'Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Count total modifications
  const totalModified =
    costs && defaultCosts
      ? TRADE_SECTIONS.reduce((sum, section) => {
          const current = costs[section];
          const defaults = defaultCosts[section];
          if (!current || !defaults) return sum;

          return (
            sum +
            Object.entries(current).filter(([key, val]) => {
              const defaultVal = (defaults as Record<string, unknown>)[key];
              if (section === 'labor_rates') return val !== defaultVal;
              return (val as CostItem).cost !== (defaultVal as CostItem)?.cost;
            }).length
          );
        }, 0)
      : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="h-10 w-full bg-gray-100 rounded" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!costs) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Cost Database</h2>
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-4">
            Could not load cost database. Make sure the Python API service is running.
          </p>
          <Button variant="secondary" onClick={loadCosts} icon={<RotateCcw className="h-4 w-4" />}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Cost Database</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Region: {costs.metadata?.region || 'National Average'}</span>
            <span className="text-gray-300">|</span>
            <span>{costs.metadata?.year || 2025}</span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Click any cost value to edit. Changes are highlighted in amber.
          {totalModified > 0 && (
            <span className="ml-2 font-medium text-amber-700">
              {totalModified} item{totalModified !== 1 ? 's' : ''} modified
            </span>
          )}
        </p>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search materials..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetToDefaults}
            icon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Reset
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            icon={<Upload className="h-3.5 w-3.5" />}
          >
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            icon={<Download className="h-3.5 w-3.5" />}
          >
            Export
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
            icon={saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          >
            {saved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
        {TRADE_SECTIONS.map((section) => {
          const sectionData = costs[section];
          const sectionDefaults = defaultCosts?.[section];
          if (!sectionData || !sectionDefaults) return null;

          return (
            <TradeSection
              key={section}
              name={section}
              label={TRADE_LABELS[section] || section}
              data={sectionData as CostSection | Record<string, number>}
              defaultData={sectionDefaults as CostSection | Record<string, number>}
              onChange={(key, value) => handleCostChange(section, key, value)}
              searchQuery={searchQuery}
            />
          );
        })}
      </div>
    </div>
  );
}
