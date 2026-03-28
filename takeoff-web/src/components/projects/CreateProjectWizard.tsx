'use client';

import React, { useState } from 'react';
import { Check, Loader2, FileText, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { FileUploadZone } from './FileUploadZone';
import { AVAILABLE_TRADES } from '@/lib/api/python-service';

const TAKEOFF_STEPS = [
  { label: 'Project Details' },
  { label: 'Select Trades' },
  { label: 'Upload Plans' },
];

const RETROFIT_STEPS = [
  { label: 'Property Details' },
  { label: 'Select Trades' },
];

const GENERIC_STEPS = [
  { label: 'Project Details' },
  { label: 'Select Trades' },
  { label: 'Input Method' },
];

export interface ProjectFormData {
  name: string;
  address: string;
  clientName: string;
  buildingType: string;
  selectedTrades: string[];
  files: File[];
  inputMethod: 'plans' | 'address';
}

type WizardMode = 'takeoff' | 'retrofit' | 'generic';

interface CreateProjectWizardProps {
  mode?: WizardMode;
  onComplete?: (data: ProjectFormData) => void;
}

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: { label: string }[];
  currentStep: number;
}) {
  return (
    <div className="flex items-center justify-center mb-10">
      {steps.map((step, idx) => {
        const isComplete = idx < currentStep;
        const isCurrent = idx === currentStep;
        return (
          <React.Fragment key={idx}>
            <div className="flex flex-col items-center">
              <div
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  isComplete
                    ? 'bg-primary text-white'
                    : isCurrent
                      ? 'bg-primary text-white ring-4 ring-primary/20'
                      : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {isComplete ? <Check className="h-5 w-5" /> : idx + 1}
              </div>
              <span
                className={[
                  'mt-2 text-xs font-medium',
                  isCurrent ? 'text-primary' : 'text-gray-400',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={[
                  'h-0.5 w-16 mx-2 mt-[-1.25rem]',
                  idx < currentStep ? 'bg-primary' : 'bg-gray-200',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CreateProjectWizard({ mode = 'generic', onComplete }: CreateProjectWizardProps) {
  const steps =
    mode === 'takeoff' ? TAKEOFF_STEPS :
    mode === 'retrofit' ? RETROFIT_STEPS :
    GENERIC_STEPS;

  const [step, setStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    address: '',
    clientName: '',
    buildingType: 'residential',
    selectedTrades: AVAILABLE_TRADES.map((t) => t.id), // all selected by default
    files: [],
    inputMethod: mode === 'retrofit' ? 'address' : 'plans',
  });

  const updateField = <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTrade = (tradeId: string) => {
    setFormData((prev) => {
      const current = prev.selectedTrades;
      const next = current.includes(tradeId)
        ? current.filter((t) => t !== tradeId)
        : [...current, tradeId];
      return { ...prev, selectedTrades: next };
    });
  };

  const canAdvance = () => {
    if (step === 0) {
      // Retrofit requires address
      if (mode === 'retrofit') {
        return formData.name.trim().length > 0 && formData.address.trim().length > 0;
      }
      return formData.name.trim().length > 0;
    }
    if (step === 1) return formData.selectedTrades.length > 0;
    // Step 2 (only in takeoff/generic mode)
    if (step === 2 && formData.inputMethod === 'address') {
      return formData.address.trim().length > 0;
    }
    return true;
  };

  const handleNext = async () => {
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
    } else {
      setIsCreating(true);
      try {
        await onComplete?.(formData);
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <StepIndicator steps={steps} currentStep={step} />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              {mode === 'retrofit' ? 'Property Details' : 'Project Details'}
            </h2>

            {/* In retrofit mode, address comes first and is required */}
            {mode === 'retrofit' && (
              <AddressAutocomplete
                label="Property Address"
                placeholder="Start typing an address..."
                value={formData.address}
                onChange={(val) => updateField('address', val)}
                onSelect={(addr) => {
                  updateField('address', addr);
                  // Auto-fill project name from address if empty
                  if (!formData.name.trim()) {
                    updateField('name', addr.split(',')[0] || addr);
                  }
                }}
              />
            )}

            <Input
              label="Project Name"
              placeholder={mode === 'retrofit' ? 'Auto-filled from address' : 'e.g. Smith Residence'}
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
            />

            {mode !== 'retrofit' && (
              <AddressAutocomplete
                label="Address"
                placeholder="Start typing an address..."
                value={formData.address}
                onChange={(val) => updateField('address', val)}
                onSelect={(addr) => updateField('address', addr)}
              />
            )}

            <Input
              label="Client Name"
              placeholder="e.g. John Smith"
              value={formData.clientName}
              onChange={(e) => updateField('clientName', e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Building Type
              </label>
              <select
                value={formData.buildingType}
                onChange={(e) => updateField('buildingType', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="multi_family">Multi-Family</option>
                <option value="renovation">Renovation</option>
              </select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Select Trades
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Choose which trades you need takeoffs for. You can select one or more.
            </p>
            <div className="space-y-3">
              {AVAILABLE_TRADES.map((trade) => {
                const isSelected = formData.selectedTrades.includes(trade.id);
                return (
                  <label
                    key={trade.id}
                    className={[
                      'flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300 bg-white',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTrade(trade.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/40"
                    />
                    <span className={[
                      'text-sm font-medium',
                      isSelected ? 'text-gray-900' : 'text-gray-600',
                    ].join(' ')}>
                      {trade.label}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateField('selectedTrades', AVAILABLE_TRADES.map((t) => t.id))}
                className="text-xs text-primary hover:text-primary/80 font-medium cursor-pointer"
              >
                Select All
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => updateField('selectedTrades', [])}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
              >
                Clear All
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                {formData.selectedTrades.length} of {AVAILABLE_TRADES.length} selected
              </span>
            </div>
          </div>
        )}

        {step === 2 && mode === 'takeoff' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Upload Construction Plans
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload blueprint PDFs for AI-powered analysis and takeoff generation.
            </p>
            <FileUploadZone
              files={formData.files}
              onFilesChange={(files) => updateField('files', files)}
            />
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>What happens next:</strong> Your project will open in the
                workspace where you can view your plans, run AI analysis to extract
                building details, and generate cost estimates for your selected trades.
              </p>
            </div>
          </div>
        )}

        {step === 2 && mode === 'generic' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              How would you like to estimate?
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload construction plans for a detailed takeoff, or estimate from the property address for existing homes.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                type="button"
                onClick={() => updateField('inputMethod', 'plans')}
                className={[
                  'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all text-center cursor-pointer',
                  formData.inputMethod === 'plans'
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white',
                ].join(' ')}
              >
                <div className={[
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  formData.inputMethod === 'plans' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400',
                ].join(' ')}>
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-gray-900">Upload Plans</div>
                  <p className="text-xs text-gray-500 mt-1">
                    Upload blueprint PDFs for AI-powered analysis and takeoff
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => updateField('inputMethod', 'address')}
                className={[
                  'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all text-center cursor-pointer',
                  formData.inputMethod === 'address'
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white',
                ].join(' ')}
              >
                <div className={[
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  formData.inputMethod === 'address' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400',
                ].join(' ')}>
                  <MapPin className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-gray-900">Estimate from Address</div>
                  <p className="text-xs text-gray-500 mt-1">
                    Generate an estimate using property data for existing homes
                  </p>
                </div>
              </button>
            </div>

            {formData.inputMethod === 'plans' && (
              <>
                <FileUploadZone
                  files={formData.files}
                  onFilesChange={(files) => updateField('files', files)}
                />
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-700">
                    <strong>What happens next:</strong> Your project will open in the
                    workspace where you can view your plans, run AI analysis to extract
                    building details, and generate cost estimates for your selected trades.
                  </p>
                </div>
              </>
            )}

            {formData.inputMethod === 'address' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-1">
                  Estimating from address
                </p>
                <p className="text-xs text-amber-700">
                  {formData.address
                    ? <>We&apos;ll look up property data for <strong>{formData.address}</strong> and generate material estimates based on the building&apos;s characteristics.</>
                    : <>Go back to Step 1 and enter a property address to use this option.</>
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 0 || isCreating}
          >
            Back
          </Button>
          <Button onClick={handleNext} disabled={!canAdvance() || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : step === steps.length - 1 ? (
              'Create Project →'
            ) : (
              'Next'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { CreateProjectWizard };
export type { WizardMode };
