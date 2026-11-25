import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Ruler,
} from 'lucide-react';
import {
  Size,
  SizeGuideTemplate,
  SizeGuideMeasurement,
  SizeGuideValue,
} from '../../../types';
import {
  recommendSize,
  FitPreference,
  normalizeMeasurementCode,
  estimateBodyFromHeightWeight,
} from '../engine/sizeRecommendationEngine';
import { useTranslation } from '../../../i18n';

interface SmartSizeFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  productTitle: string;
  template: SizeGuideTemplate;
  measurements: SizeGuideMeasurement[];
  values: SizeGuideValue[];
  availableSizes: Size[];
  onSelectSize: (size: Size) => void;
}

export const SmartSizeFinderModal: React.FC<SmartSizeFinderModalProps> = ({
  isOpen,
  onClose,
  productTitle,
  template,
  measurements,
  values,
  availableSizes,
  onSelectSize,
}) => {
  const { locale } = useTranslation();
  const isIt = locale === 'it';

  // Input mode: direct specific measurements vs height & weight estimation
  const [inputMode, setInputMode] = useState<'direct' | 'estimate'>('direct');

  // Filter measurements belonging to this product's template
  const templateMeasurements = useMemo(() => {
    return measurements.filter((m) => Number(m.template_id) === Number(template.id));
  }, [measurements, template.id]);

  // Dynamic user values stored per measurement_id
  const [measValues, setMeasValues] = useState<Record<number, number>>({});

  // Height & Weight states
  const [heightCm, setHeightCm] = useState<number>(175);
  const [weightKg, setWeightKg] = useState<number>(75);
  const [gender, setGender] = useState<'unisex' | 'male' | 'female'>('unisex');

  // Fit style preference
  const [fitPreference, setFitPreference] = useState<FitPreference>('regular');

  // Initialize or populate sensible defaults from template average values
  useEffect(() => {
    if (templateMeasurements.length === 0) return;
    setMeasValues((prev) => {
      const next = { ...prev };
      templateMeasurements.forEach((m) => {
        if (!next[m.id]) {
          // Find an average or medium size value from the template to use as a good baseline
          const mValues = values
            .filter((v) => Number(v.measurement_id) === Number(m.id) && Number(v.value) > 0)
            .map((v) => Number(v.value));
          if (mValues.length > 0) {
            const mid = mValues[Math.floor(mValues.length / 2)] || 90;
            // Subtract typical ease so it represents body baseline
            next[m.id] = Math.max(20, mid - 4);
          } else {
            next[m.id] = 85;
          }
        }
      });
      return next;
    });
  }, [templateMeasurements, values]);

  // When height & weight change in estimation mode, update the dynamic measurements
  useEffect(() => {
    if (inputMode !== 'estimate') return;
    const est = estimateBodyFromHeightWeight(heightCm, weightKg, gender);
    setMeasValues((prev) => {
      const next = { ...prev };
      templateMeasurements.forEach((m) => {
        const canonical = normalizeMeasurementCode(m.name, m.code);
        if (est[canonical]) {
          next[m.id] = est[canonical];
        }
      });
      return next;
    });
  }, [heightCm, weightKg, gender, inputMode, templateMeasurements]);

  // Run Recommendation Algorithm
  const result = useMemo(() => {
    return recommendSize(
      {
        byMeasurementId: measValues,
        height: inputMode === 'estimate' ? heightCm : undefined,
        weight: inputMode === 'estimate' ? weightKg : undefined,
        gender,
        fitPreference,
      },
      template,
      templateMeasurements,
      values,
      availableSizes,
      locale === 'it' ? 'it' : 'en'
    );
  }, [measValues, heightCm, weightKg, gender, fitPreference, template, templateMeasurements, values, availableSizes, inputMode, locale]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#12141a] overflow-hidden shadow-xl border border-neutral-200/80 dark:border-neutral-800 animate-in zoom-in-95 my-auto"
        onClick={(e) => e.stopPropagation()}
        dir="ltr"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center shrink-0">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {isIt ? 'Guida intelligente alle taglie' : 'Smart Size Finder'}
              </h3>
              <p className="text-[11px] text-neutral-500 truncate max-w-xs sm:max-w-md">
                {isIt ? 'Prodotto:' : 'Product:'} {productTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Mode Selector */}
        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/40 border-b border-neutral-200/70 dark:border-neutral-800">
          <div className="flex rounded-xl bg-neutral-200/70 dark:bg-neutral-800 p-0.5 max-w-xs mx-auto">
            <button
              type="button"
              onClick={() => setInputMode('direct')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                inputMode === 'direct'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              {isIt ? 'Misure esatte' : 'Exact Measurements'}
            </button>
            <button
              type="button"
              onClick={() => setInputMode('estimate')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                inputMode === 'estimate'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              {isIt ? 'Stima altezza e peso' : 'Height & Weight'}
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4 text-xs">
          {/* Mode 1: Exact Template Measurements */}
          {inputMode === 'direct' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-neutral-500 pb-1">
                <span>
                  {isIt
                    ? 'Inserisci le tue misure corporee con metro da sarto:'
                    : 'Enter your body measurements using a measuring tape:'}
                </span>
                <span className="text-[11px] font-mono">{isIt ? 'Unità: cm' : 'Unit: cm'}</span>
              </div>

              {templateMeasurements.length === 0 ? (
                <div className="p-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-center text-neutral-500">
                  {isIt
                    ? 'Nessun parametro di misura definito per questo prodotto.'
                    : 'No measurement parameters have been defined for this product.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templateMeasurements.map((meas) => {
                    const currentVal = measValues[meas.id] || 90;
                    return (
                      <div
                        key={`meas_in_${meas.id}`}
                        className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-800"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {meas.name}
                          </label>
                          <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                            {currentVal} {meas.unit || 'cm'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="160"
                          value={currentVal}
                          onChange={(e) =>
                            setMeasValues((prev) => ({
                              ...prev,
                              [meas.id]: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-neutral-900 dark:accent-white cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Mode 2: Height & Weight Estimation */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-800">
                  <div className="flex justify-between mb-1.5">
                    <label className="font-semibold">{isIt ? 'Altezza:' : 'Height:'}</label>
                    <span className="font-mono font-bold">{heightCm} cm</span>
                  </div>
                  <input
                    type="range"
                    min="140"
                    max="210"
                    value={heightCm}
                    onChange={(e) => setHeightCm(Number(e.target.value))}
                    className="w-full accent-neutral-900 dark:accent-white cursor-pointer"
                  />
                </div>

                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-800">
                  <div className="flex justify-between mb-1.5">
                    <label className="font-semibold">{isIt ? 'Peso:' : 'Weight:'}</label>
                    <span className="font-mono font-bold">{weightKg} kg</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="140"
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full accent-neutral-900 dark:accent-white cursor-pointer"
                  />
                </div>
              </div>

              {/* Gender selector */}
              <div className="flex items-center gap-3">
                <span className="text-neutral-500 font-semibold">
                  {isIt ? 'Corporatura:' : 'Body Profile:'}
                </span>
                <div className="flex gap-2">
                  {(['unisex', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`px-3 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
                        gender === g
                          ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900 font-bold'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {g === 'male'
                        ? isIt ? 'Uomo' : 'Men'
                        : g === 'female'
                        ? isIt ? 'Donna' : 'Women'
                        : isIt ? 'Standard' : 'Standard'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Fit Style Selection */}
          <div className="pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
            <label className="block font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
              {isIt ? 'Vestibilità preferita:' : 'Preferred Fit Style:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['snug', 'regular', 'relaxed'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFitPreference(mode)}
                  className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                    fitPreference === mode
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900 font-bold shadow-xs'
                      : 'border-neutral-200/80 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span className="block text-xs">
                    {mode === 'snug'
                      ? isIt ? 'Aderente (Slim)' : 'Slim Fit'
                      : mode === 'relaxed'
                      ? isIt ? 'Ampia (Loose)' : 'Relaxed Fit'
                      : isIt ? 'Regolare (Regular)' : 'Regular Fit'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Engine Output Banner */}
          {result && result.recommendedSize && (
            <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-neutral-500 block">
                    {isIt ? 'Taglia consigliata:' : 'Recommended Size:'}
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-extrabold text-neutral-900 dark:text-neutral-100">
                      {isIt ? 'Taglia' : 'Size'} {result.recommendedSize.name}
                    </span>
                    <span className="text-xs font-mono text-neutral-500">
                      ({result.matchScore}% {isIt ? 'compatibilità' : 'match'})
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (result.recommendedSize) {
                      onSelectSize(result.recommendedSize);
                      onClose();
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-bold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  {isIt ? 'Seleziona taglia' : 'Select This Size'}
                </button>
              </div>

              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
                {result.fitDescription}
              </p>

              {/* Breakdown of measurement comparisons */}
              {result.comparisons.length > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-200/60 dark:border-neutral-800 space-y-1.5">
                  {result.comparisons.map((c) => (
                    <div
                      key={`comp_row_${c.measurementId}`}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="text-neutral-600 dark:text-neutral-300 font-medium">
                        {c.measurementName}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-neutral-400">
                          {isIt ? 'Capo:' : 'Garment:'} {c.garmentValue}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            c.status === 'ideal'
                              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200'
                              : c.status === 'tight_risk'
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          {c.note}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {isIt ? 'Chiudi' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
