/**
 * Apply user corrections from the measurement review step back into the BuildingModel.
 *
 * When a user corrects a detected measurement (changing its value and setting
 * status to 'corrected'), this utility applies those corrections to the model
 * so that trade calculators use the corrected dimensions.
 */

import type { DetectedMeasurement } from '@/lib/types/detected-measurement';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A Dimension object as stored in the BuildingModel JSON */
interface DimensionValue {
  feet: number;
  inches: number;
}

/** Any model entity that might have dimension fields */
interface ModelEntity {
  id?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Apply corrected measurements to a BuildingModel, returning a new model.
 * Only measurements with status === 'corrected' are applied.
 *
 * @param model - The current BuildingModel JSON (will not be mutated)
 * @param detectedMeasurements - All detected measurements (only 'corrected' ones are applied)
 * @returns A new model object with corrections applied
 */
export function applyMeasurementCorrections(
  model: Record<string, unknown>,
  detectedMeasurements: DetectedMeasurement[]
): Record<string, unknown> {
  const corrections = detectedMeasurements.filter(m => m.status === 'corrected');
  if (corrections.length === 0) return model;

  // Deep clone to avoid mutating the original
  const corrected = JSON.parse(JSON.stringify(model)) as Record<string, unknown>;

  for (const correction of corrections) {
    const { entity, entityId, field } = correction.modelRef;
    const newValue: DimensionValue = {
      feet: correction.value.feet,
      inches: correction.value.inches,
    };

    switch (entity) {
      case 'wall':
        applyToEntityList(corrected, 'walls', entityId, field, newValue);
        break;
      case 'room':
        applyToEntityList(corrected, 'rooms', entityId, field, newValue);
        break;
      case 'opening':
        applyToEntityList(corrected, 'openings', entityId, field, newValue);
        break;
      case 'roof':
        applyToRoof(corrected, entityId, field, newValue);
        break;
      case 'foundation':
        applyToFoundation(corrected, field, newValue);
        break;
    }
  }

  return corrected;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply a dimension correction to an entity in a named array (walls, rooms, openings).
 */
function applyToEntityList(
  model: Record<string, unknown>,
  listKey: string,
  entityId: string,
  field: string,
  value: DimensionValue
): void {
  const list = model[listKey];
  if (!Array.isArray(list)) return;

  const entity = list.find((item: ModelEntity) => item.id === entityId);
  if (!entity) return;

  // For dimension fields (length, height, width, ceiling_height), set as {feet, inches}
  if (isDimensionField(field)) {
    entity[field] = { feet: value.feet, inches: value.inches };
  }
  // For numeric fields (area, perimeter), convert to total value
  else if (isNumericField(field)) {
    entity[field] = value.feet + value.inches / 12;
  }
}

/**
 * Apply a correction to a roof section.
 */
function applyToRoof(
  model: Record<string, unknown>,
  entityId: string,
  field: string,
  value: DimensionValue
): void {
  const sections = model['roof_sections'];
  if (!Array.isArray(sections)) return;

  const section = sections.find((s: ModelEntity) => s.id === entityId);
  if (!section) return;

  if (isNumericField(field)) {
    // Roof fields like area, ridge_length are stored as plain numbers (feet)
    section[field] = value.feet + value.inches / 12;
  } else {
    section[field] = { feet: value.feet, inches: value.inches };
  }
}

/**
 * Apply a correction to the foundation.
 */
function applyToFoundation(
  model: Record<string, unknown>,
  field: string,
  value: DimensionValue
): void {
  const foundation = model['foundation'];
  if (!foundation || typeof foundation !== 'object') return;

  const f = foundation as Record<string, unknown>;
  if (isNumericField(field)) {
    f[field] = value.feet + value.inches / 12;
  } else {
    f[field] = { feet: value.feet, inches: value.inches };
  }
}

/**
 * Fields that store {feet, inches} Dimension objects.
 */
function isDimensionField(field: string): boolean {
  return ['length', 'height', 'width', 'ceiling_height', 'eave_depth'].includes(field);
}

/**
 * Fields that store plain numeric values (sqft, linear feet).
 */
function isNumericField(field: string): boolean {
  return ['area', 'perimeter', 'floor_area', 'actual_area', 'horizontal_area',
          'ridge_length', 'eave_length', 'hip_length', 'valley_length'].includes(field);
}
