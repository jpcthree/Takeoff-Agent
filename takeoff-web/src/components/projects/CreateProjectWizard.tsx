'use client';

import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FileUploadZone } from './FileUploadZone';
import { AVAILABLE_TRADES } from '@/lib/api/python-service';

const STEPS = [
  { label: 'Project Details' },
  { label: 'Select Trades' },
  { label: 'Upload Plans' },
];

export interface ProjectFormData {
  name: string;
  address: string;
  clientName: string;
  buildingType: string;
  selectedTrades: string[];
  files: File[];
}

interface CreateProjectWizardProps {
  onComplete?: (data: ProjectFormData) => void;
}

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: typeof STEPS;
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

function CreateProjectWizard({ onComplete }: CreateProjectWizardProps) {
  const [step, setStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    address: '',
    clientName: '',
    buildingType: 'residential',
    selectedTrades: AVAILABLE_TRADES.map((t) => t.id), // all selected by default
    files: [],
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
    if (step === 0) return formData.name.trim().length > 0;
    if (step === 1) return formData.selectedTrades.length > 0;
    return true;
  };

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
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
      <StepIndicator steps={STEPS} currentStep={step} />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              Project Details
            </h2>
            <Input
              label="Project Name"
              placeholder="e.g. Smith Residence"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
            <Input
              label="Address"
              placeholder="e.g. 123 Main St, Austin, TX"
              value={formData.address}
              onChange={(e) => updateField('address', e.target.value)}
            />
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

        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Upload Plans
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload your blueprint PDFs. You can also upload or re-upload plans later in the project workspace.
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
            ) : step === STEPS.length - 1 ? (
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
