/**
 * Clozito Smart Size Recommendation Engine
 * Dynamic garment-to-body matching algorithms strictly based on
 * the specific measurements of the product's assigned Size Guide Template.
 */

import { Size, SizeGuideMeasurement, SizeGuideValue, SizeGuideTemplate } from '../../../types';

export type FitPreference = 'snug' | 'regular' | 'relaxed';

export interface UserDynamicMeasurements {
  /**
   * Values provided by the user mapped by measurement_id (preferred)
   */
  byMeasurementId?: Record<number, number>;
  /**
   * Fallback values by measurement code/name
   */
  byCode?: Record<string, number>;
  /**
   * Optional height/weight for estimation fallback
   */
  height?: number; // cm
  weight?: number; // kg
  gender?: 'unisex' | 'male' | 'female';
  fitPreference: FitPreference;
}

export interface DimensionComparison {
  measurementId: number;
  measurementName: string;
  measurementUnit: string;
  userBodyValue: number;
  garmentValue: number;
  easeAmount: number;
  idealEaseMin: number;
  idealEaseMax: number;
  status: 'snug' | 'ideal' | 'loose' | 'tight_risk';
  note: string;
}

export interface SizeRecommendationResult {
  recommendedSize: Size | null;
  matchScore: number; // 0 - 100
  fitStatus: 'perfect' | 'comfortable' | 'borderline_tight' | 'borderline_loose';
  fitDescription: string;
  detailedAnalysis: string;
  comparisons: DimensionComparison[];
  allRankedSizes: Array<{
    size: Size;
    score: number;
    fitFeel: string;
    isRecommended: boolean;
  }>;
}

/**
 * Standardize English & Italian measurement keys to canonical dimensions
 */
export function normalizeMeasurementCode(name: string, code?: string): string {
  const text = `${name || ''} ${code || ''}`.toLowerCase();

  if (text.includes('chest') || text.includes('bust') || text.includes('petto') || text.includes('torace') || text.includes('seno')) return 'chest';
  if (text.includes('waist') || text.includes('vita')) return 'waist';
  if (text.includes('hip') || text.includes('fianch') || text.includes('bacino')) return 'hip';
  if (text.includes('shoulder') || text.includes('spall')) return 'shoulder';
  if (text.includes('length') || text.includes('lunghezza')) return 'length';
  if (text.includes('sleeve') || text.includes('manic')) return 'arm_length';
  if (text.includes('thigh') || text.includes('cosci')) return 'thigh';
  if (text.includes('leg_opening') || text.includes('hem') || text.includes('fondo')) return 'leg_opening';
  if (text.includes('inseam') || text.includes('cavallo') || text.includes('pants')) return 'pants_length';
  if (text.includes('foot') || text.includes('pied')) return 'foot_length';

  return code || 'general';
}

/**
 * Anthropometric Estimation: Estimate measurements from Height and Weight
 */
export function estimateBodyFromHeightWeight(
  heightCm: number,
  weightKg: number,
  gender: 'unisex' | 'male' | 'female' = 'unisex'
): Record<string, number> {
  const bmi = weightKg / Math.pow(heightCm / 100, 2);

  if (gender === 'female') {
    const chest = Math.round(weightKg * 0.95 + heightCm * 0.22);
    const waist = Math.round(chest * 0.74 + (bmi > 25 ? (bmi - 25) * 1.5 : 0));
    const hip = Math.round(chest * 1.04 + (bmi > 25 ? (bmi - 25) * 1.2 : 0));
    const shoulder = Math.round(heightCm * 0.22 + 4);
    const length = Math.round(heightCm * 0.42);
    const pants_length = Math.round(heightCm * 0.58);
    const thigh = Math.round(hip * 0.54);
    return { chest, waist, hip, shoulder, length, pants_length, thigh };
  }

  // Male / Unisex baseline
  const chest = Math.round(weightKg * 1.05 + heightCm * 0.18);
  const waist = Math.round(chest * 0.82 + (bmi > 25 ? (bmi - 25) * 1.6 : 0));
  const hip = Math.round(chest * 0.98 + (bmi > 25 ? (bmi - 25) * 1.0 : 0));
  const shoulder = Math.round(heightCm * 0.25 + 5);
  const length = Math.round(heightCm * 0.44);
  const pants_length = Math.round(heightCm * 0.60);
  const thigh = Math.round(hip * 0.55);
  return { chest, waist, hip, shoulder, length, pants_length, thigh };
}

/**
 * Ideal Garment Ease Tolerances (cm added to body measurement)
 */
const EASE_MAP: Record<string, Record<FitPreference, [number, number]>> = {
  chest: {
    snug: [1, 3],
    regular: [4, 7],
    relaxed: [8, 13],
  },
  waist: {
    snug: [0, 2],
    regular: [2, 5],
    relaxed: [5, 8],
  },
  hip: {
    snug: [1, 3],
    regular: [4, 6],
    relaxed: [7, 10],
  },
  thigh: {
    snug: [1, 2],
    regular: [3, 5],
    relaxed: [6, 9],
  },
  shoulder: {
    snug: [0, 1],
    regular: [1, 3],
    relaxed: [3, 5],
  },
  length: {
    snug: [-1, 2],
    regular: [0, 4],
    relaxed: [3, 7],
  },
  pants_length: {
    snug: [-2, 1],
    regular: [0, 3],
    relaxed: [2, 6],
  },
  general: {
    snug: [0, 2],
    regular: [2, 5],
    relaxed: [5, 8],
  },
};

/**
 * Main Dynamic Size Recommendation Engine
 * Strictly uses the template's actual measurements.
 */
export function recommendSize(
  user: UserDynamicMeasurements,
  template: SizeGuideTemplate,
  measurements: SizeGuideMeasurement[],
  values: SizeGuideValue[],
  availableSizes: Size[],
  locale: 'en' | 'it' = 'en'
): SizeRecommendationResult {
  const isIt = locale === 'it';

  // If height/weight provided, calculate estimations as fallback
  const estimations =
    user.height && user.weight
      ? estimateBodyFromHeightWeight(user.height, user.weight, user.gender || 'unisex')
      : {};

  // Filter template measurements
  const templateMeasurements = measurements.filter(
    (m) => Number(m.template_id) === Number(template.id)
  );

  // Filter values for this template
  const templateValues = values.filter((v) => Number(v.template_id) === Number(template.id));

  // Determine sizes that have recorded values
  const sizesWithValues = availableSizes.filter((s) =>
    templateValues.some((v) => Number(v.size_id) === Number(s.id) && Number(v.value) > 0)
  );

  if (sizesWithValues.length === 0 || templateMeasurements.length === 0) {
    const fallbackSize = availableSizes[0] || null;
    return {
      recommendedSize: fallbackSize,
      matchScore: 65,
      fitStatus: 'comfortable',
      fitDescription: isIt
        ? 'La tabella delle misure per questo prodotto è in fase di completamento; è stata suggerita la taglia predefinita più vicina.'
        : 'Size chart measurements for this product are being completed; the closest default size is suggested.',
      detailedAnalysis: isIt
        ? 'Consulta la tabella delle taglie.'
        : 'Please review the size guide table.',
      comparisons: [],
      allRankedSizes: availableSizes.map((s, idx) => ({
        size: s,
        score: idx === 0 ? 65 : 55,
        fitFeel: s.name,
        isRecommended: idx === 0,
      })),
    };
  }

  // Score each size based on the product's actual measurements
  const scoredSizes = sizesWithValues.map((size) => {
    let sizePenalty = 0;
    let totalWeight = 0;
    const comparisons: DimensionComparison[] = [];

    templateMeasurements.forEach((meas) => {
      const canonicalKey = normalizeMeasurementCode(meas.name, meas.code);

      // 1. Resolve user's value: direct measurement_id takes highest precedence
      let userVal = user.byMeasurementId?.[meas.id];
      if (userVal === undefined || userVal === null || isNaN(userVal)) {
        userVal = user.byCode?.[canonicalKey];
      }
      if (userVal === undefined || userVal === null || isNaN(userVal)) {
        userVal = estimations[canonicalKey];
      }

      // If user hasn't provided a value for this measurement, skip
      if (!userVal || userVal <= 0) {
        return;
      }

      // 2. Resolve garment value in size guide
      const valObj = templateValues.find(
        (v) => Number(v.size_id) === Number(size.id) && Number(v.measurement_id) === Number(meas.id)
      );

      const garmentVal = Number(valObj?.value ?? valObj?.min_value ?? 0);
      if (garmentVal <= 0) {
        return;
      }

      const easeConfig = EASE_MAP[canonicalKey] || EASE_MAP.general;
      const [idealMin, idealMax] = easeConfig[user.fitPreference || 'regular'];
      const actualEase = garmentVal - userVal;
      const unit = meas.unit || 'cm';

      // Weight multiplier based on measurement importance
      const weight =
        canonicalKey === 'chest' || canonicalKey === 'waist'
          ? 3.0
          : canonicalKey === 'hip' || canonicalKey === 'shoulder'
          ? 2.0
          : 1.0;
      totalWeight += weight;

      let dimPenalty = 0;
      let status: DimensionComparison['status'] = 'ideal';
      let note = '';

      if (actualEase < idealMin) {
        if (actualEase < 0) {
          dimPenalty = Math.abs(actualEase) * 14;
          status = 'tight_risk';
          note = isIt
            ? `Più stretto del corpo (${Math.abs(actualEase)} ${unit} stretto)`
            : `Smaller than body (${Math.abs(actualEase)} ${unit} tight)`;
        } else {
          dimPenalty = (idealMin - actualEase) * 5;
          status = 'snug';
          note = isIt
            ? `Vestibilità aderente (${actualEase} ${unit} di agio)`
            : `Snug fit (${actualEase} ${unit} ease)`;
        }
      } else if (actualEase > idealMax) {
        dimPenalty = (actualEase - idealMax) * 4.5;
        status = 'loose';
        note = isIt
          ? `Più ampio dello standard (${actualEase} ${unit} di agio)`
          : `Looser than standard (${actualEase} ${unit} ease)`;
      } else {
        status = 'ideal';
        note = isIt
          ? `Vestibilità ideale (${actualEase} ${unit} di agio)`
          : `Ideal match for desired fit (${actualEase} ${unit} ease)`;
      }

      sizePenalty += dimPenalty * weight;

      comparisons.push({
        measurementId: meas.id,
        measurementName: meas.name,
        measurementUnit: unit,
        userBodyValue: userVal,
        garmentValue: garmentVal,
        easeAmount: actualEase,
        idealEaseMin: idealMin,
        idealEaseMax: idealMax,
        status,
        note,
      });
    });

    const normalizedPenalty = totalWeight > 0 ? sizePenalty / totalWeight : 50;
    const score = Math.max(10, Math.min(99, Math.round(100 - normalizedPenalty)));

    let fitFeel = isIt ? 'Bilanciata' : 'Balanced';
    if (comparisons.some((c) => c.status === 'tight_risk')) {
      fitFeel = isIt ? 'Rischio stretto' : 'Tight risk';
    } else if (comparisons.every((c) => c.status === 'loose')) {
      fitFeel = isIt ? 'Ampia / Oversize' : 'Relaxed / Oversize';
    } else if (comparisons.every((c) => c.status === 'snug')) {
      fitFeel = isIt ? 'Aderente (Slim)' : 'Snug (Slim)';
    }

    return {
      size,
      score,
      fitFeel,
      comparisons,
    };
  });

  scoredSizes.sort((a, b) => b.score - a.score);

  const best = scoredSizes[0];
  const recommendedSize = best?.size || availableSizes[0] || null;
  const matchScore = best?.score || 70;

  let fitStatus: SizeRecommendationResult['fitStatus'] = 'comfortable';
  let fitDescription = '';

  if (best?.comparisons.some((c) => c.status === 'tight_risk')) {
    fitStatus = 'borderline_tight';
    fitDescription = isIt
      ? 'Questa taglia può risultare aderente in alcuni punti; considera una taglia più grande per maggiore comfort.'
      : 'This size may fit snugly in some areas; consider sizing up for extra comfort.';
  } else if (matchScore >= 88) {
    fitStatus = 'perfect';
    fitDescription = isIt
      ? 'Ottima corrispondenza con le tue misure e lo stile scelto.'
      : 'Very high match with your measurements and chosen fit style.';
  } else if (matchScore >= 72) {
    fitStatus = 'comfortable';
    fitDescription = isIt
      ? 'Vestibilità standard e confortevole in base alla guida alle taglie del capo.'
      : 'Standard comfortable fit according to the garment size guide.';
  } else {
    fitStatus = 'borderline_loose';
    fitDescription = isIt
      ? 'La taglia più vicina al modello di questo capo.'
      : 'Closest matching size for this garment pattern.';
  }

  return {
    recommendedSize,
    matchScore,
    fitStatus,
    fitDescription,
    detailedAnalysis: isIt
      ? `Taglia consigliata calcolata su ${best?.comparisons.length || 0} misure specifiche di questo modello.`
      : `Recommended size calculated from ${best?.comparisons.length || 0} specific measurements for this pattern.`,
    comparisons: best?.comparisons || [],
    allRankedSizes: scoredSizes.map((s, idx) => ({
      size: s.size,
      score: s.score,
      fitFeel: s.fitFeel,
      isRecommended: idx === 0,
    })),
  };
}
