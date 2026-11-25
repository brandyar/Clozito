import { MeasurementType, MeasurementUnit, SizeGuideType, SizeUnit } from '../../types';

export interface EuSizePresetMeasurement {
  code: string;
  nameEn: string;
  nameIt: string;
  type: MeasurementType;
  unit: MeasurementUnit;
}

export interface EuSizePresetValue {
  value: number;
  min?: number;
  max?: number;
}

export interface EuSizeGuidePreset {
  id: string;
  badge: string;
  nameEn: string;
  nameIt: string;
  descriptionEn: string;
  descriptionIt: string;
  type: SizeGuideType;
  unit: SizeUnit;
  sizes: { name: string; code: string; sort: number }[];
  measurements: EuSizePresetMeasurement[];
  /** Map of size.name -> { [measurement.code]: numeric cm value (with optional min/max range) } */
  values: Record<string, Record<string, EuSizePresetValue>>;
}

export const EU_SIZE_GUIDE_PRESETS: EuSizeGuidePreset[] = [
  {
    id: 'it_women_apparel_38_52',
    badge: 'IT 38–52',
    nameEn: "Italian Women's Apparel (IT 38–52)",
    nameIt: 'Abbigliamento Donna Italiano (IT 38–52)',
    descriptionEn: 'Standard Italian women sizing scale (IT 38 to IT 52) with bust, waist, hip, and garment length in centimeters.',
    descriptionIt: 'Scala taglie standard donna italiana (da IT 38 a IT 52) con circonferenza seno, vita, fianchi e lunghezza capo in cm.',
    type: 'apparel',
    unit: 'cm',
    sizes: [
      { name: 'IT 38', code: 'IT38', sort: 38 },
      { name: 'IT 40', code: 'IT40', sort: 40 },
      { name: 'IT 42', code: 'IT42', sort: 42 },
      { name: 'IT 44', code: 'IT44', sort: 44 },
      { name: 'IT 46', code: 'IT46', sort: 46 },
      { name: 'IT 48', code: 'IT48', sort: 48 },
      { name: 'IT 50', code: 'IT50', sort: 50 },
      { name: 'IT 52', code: 'IT52', sort: 52 },
    ],
    measurements: [
      { code: 'chest', nameEn: 'Bust / Chest', nameIt: 'Seno / Torace', type: 'circumference', unit: 'cm' },
      { code: 'waist', nameEn: 'Waist', nameIt: 'Vita', type: 'circumference', unit: 'cm' },
      { code: 'hip', nameEn: 'Hips', nameIt: 'Fianchi', type: 'circumference', unit: 'cm' },
      { code: 'length', nameEn: 'Garment Length', nameIt: 'Lunghezza Capo', type: 'length', unit: 'cm' },
    ],
    values: {
      'IT 38': { chest: { value: 82, min: 80, max: 83 }, waist: { value: 62, min: 60, max: 63 }, hip: { value: 88, min: 86, max: 89 }, length: { value: 60 } },
      'IT 40': { chest: { value: 86, min: 84, max: 87 }, waist: { value: 66, min: 64, max: 67 }, hip: { value: 92, min: 90, max: 93 }, length: { value: 61 } },
      'IT 42': { chest: { value: 90, min: 88, max: 91 }, waist: { value: 70, min: 68, max: 71 }, hip: { value: 96, min: 94, max: 97 }, length: { value: 62 } },
      'IT 44': { chest: { value: 94, min: 92, max: 95 }, waist: { value: 74, min: 72, max: 75 }, hip: { value: 100, min: 98, max: 101 }, length: { value: 63 } },
      'IT 46': { chest: { value: 98, min: 96, max: 100 }, waist: { value: 78, min: 76, max: 80 }, hip: { value: 104, min: 102, max: 106 }, length: { value: 64 } },
      'IT 48': { chest: { value: 103, min: 101, max: 105 }, waist: { value: 83, min: 81, max: 85 }, hip: { value: 109, min: 107, max: 111 }, length: { value: 65 } },
      'IT 50': { chest: { value: 108, min: 106, max: 111 }, waist: { value: 88, min: 86, max: 91 }, hip: { value: 114, min: 112, max: 117 }, length: { value: 66 } },
      'IT 52': { chest: { value: 114, min: 112, max: 117 }, waist: { value: 94, min: 92, max: 97 }, hip: { value: 120, min: 118, max: 123 }, length: { value: 67 } },
    },
  },
  {
    id: 'it_men_apparel_44_56',
    badge: 'IT 44–56',
    nameEn: "Italian Men's Apparel (IT 44–56)",
    nameIt: 'Abbigliamento Uomo Italiano (IT 44–56)',
    descriptionEn: 'Standard Italian men tailoring & ready-to-wear scale (IT 44 to IT 56) with chest, waist, shoulder, sleeve, and length.',
    descriptionIt: 'Scala taglie standard uomo italiana (da IT 44 a IT 56) per giacche, camicie e capispalla con torace, vita, spalle e manica.',
    type: 'apparel',
    unit: 'cm',
    sizes: [
      { name: 'IT 44', code: 'IT44', sort: 44 },
      { name: 'IT 46', code: 'IT46', sort: 46 },
      { name: 'IT 48', code: 'IT48', sort: 48 },
      { name: 'IT 50', code: 'IT50', sort: 50 },
      { name: 'IT 52', code: 'IT52', sort: 52 },
      { name: 'IT 54', code: 'IT54', sort: 54 },
      { name: 'IT 56', code: 'IT56', sort: 56 },
    ],
    measurements: [
      { code: 'chest', nameEn: 'Chest', nameIt: 'Torace', type: 'circumference', unit: 'cm' },
      { code: 'waist', nameEn: 'Waist', nameIt: 'Vita', type: 'circumference', unit: 'cm' },
      { code: 'shoulder', nameEn: 'Shoulder Width', nameIt: 'Larghezza Spalle', type: 'width', unit: 'cm' },
      { code: 'sleeve', nameEn: 'Sleeve Length', nameIt: 'Lunghezza Manica', type: 'length', unit: 'cm' },
      { code: 'length', nameEn: 'Back Length', nameIt: 'Lunghezza Schiena', type: 'length', unit: 'cm' },
    ],
    values: {
      'IT 44': { chest: { value: 88, min: 86, max: 90 }, waist: { value: 76, min: 74, max: 78 }, shoulder: { value: 43 }, sleeve: { value: 61 }, length: { value: 69 } },
      'IT 46': { chest: { value: 92, min: 91, max: 94 }, waist: { value: 80, min: 79, max: 82 }, shoulder: { value: 44.5 }, sleeve: { value: 62.5 }, length: { value: 70.5 } },
      'IT 48': { chest: { value: 96, min: 95, max: 98 }, waist: { value: 84, min: 83, max: 86 }, shoulder: { value: 46 }, sleeve: { value: 64 }, length: { value: 72 } },
      'IT 50': { chest: { value: 100, min: 99, max: 102 }, waist: { value: 88, min: 87, max: 90 }, shoulder: { value: 47.5 }, sleeve: { value: 65 }, length: { value: 73.5 } },
      'IT 52': { chest: { value: 104, min: 103, max: 106 }, waist: { value: 93, min: 91, max: 95 }, shoulder: { value: 49 }, sleeve: { value: 66 }, length: { value: 75 } },
      'IT 54': { chest: { value: 109, min: 107, max: 111 }, waist: { value: 98, min: 96, max: 100 }, shoulder: { value: 50.5 }, sleeve: { value: 67 }, length: { value: 76.5 } },
      'IT 56': { chest: { value: 114, min: 112, max: 116 }, waist: { value: 103, min: 101, max: 106 }, shoulder: { value: 52 }, sleeve: { value: 68 }, length: { value: 78 } },
    },
  },
  {
    id: 'eu_apparel_34_48',
    badge: 'EU 34–48',
    nameEn: 'European Apparel Standard (EU 34–48)',
    nameIt: 'Abbigliamento Standard Europeo (EU 34–48)',
    descriptionEn: 'Central European standard apparel chart (EU 34 to EU 48, DE/FR/ES compatible) with chest, waist, hips, and length.',
    descriptionIt: 'Tabella taglie europea standard (da EU 34 a EU 48, compatibile DE/FR/ES) con torace, vita, fianchi e lunghezza.',
    type: 'apparel',
    unit: 'cm',
    sizes: [
      { name: 'EU 34', code: 'EU34', sort: 34 },
      { name: 'EU 36', code: 'EU36', sort: 36 },
      { name: 'EU 38', code: 'EU38', sort: 38 },
      { name: 'EU 40', code: 'EU40', sort: 40 },
      { name: 'EU 42', code: 'EU42', sort: 42 },
      { name: 'EU 44', code: 'EU44', sort: 44 },
      { name: 'EU 46', code: 'EU46', sort: 46 },
      { name: 'EU 48', code: 'EU48', sort: 48 },
    ],
    measurements: [
      { code: 'chest', nameEn: 'Chest / Bust', nameIt: 'Torace / Seno', type: 'circumference', unit: 'cm' },
      { code: 'waist', nameEn: 'Waist', nameIt: 'Vita', type: 'circumference', unit: 'cm' },
      { code: 'hip', nameEn: 'Hips', nameIt: 'Fianchi', type: 'circumference', unit: 'cm' },
      { code: 'length', nameEn: 'Length', nameIt: 'Lunghezza', type: 'length', unit: 'cm' },
    ],
    values: {
      'EU 34': { chest: { value: 82, min: 80, max: 83 }, waist: { value: 64, min: 62, max: 65 }, hip: { value: 90, min: 88, max: 91 }, length: { value: 60 } },
      'EU 36': { chest: { value: 86, min: 84, max: 87 }, waist: { value: 68, min: 66, max: 69 }, hip: { value: 94, min: 92, max: 95 }, length: { value: 61 } },
      'EU 38': { chest: { value: 90, min: 88, max: 91 }, waist: { value: 72, min: 70, max: 73 }, hip: { value: 98, min: 96, max: 99 }, length: { value: 62 } },
      'EU 40': { chest: { value: 94, min: 92, max: 95 }, waist: { value: 76, min: 74, max: 77 }, hip: { value: 102, min: 100, max: 103 }, length: { value: 63 } },
      'EU 42': { chest: { value: 98, min: 96, max: 100 }, waist: { value: 80, min: 78, max: 82 }, hip: { value: 106, min: 104, max: 108 }, length: { value: 64 } },
      'EU 44': { chest: { value: 103, min: 101, max: 105 }, waist: { value: 85, min: 83, max: 87 }, hip: { value: 111, min: 109, max: 113 }, length: { value: 65 } },
      'EU 46': { chest: { value: 108, min: 106, max: 111 }, waist: { value: 90, min: 88, max: 93 }, hip: { value: 116, min: 114, max: 119 }, length: { value: 66 } },
      'EU 48': { chest: { value: 114, min: 112, max: 117 }, waist: { value: 96, min: 94, max: 99 }, hip: { value: 122, min: 120, max: 125 }, length: { value: 67 } },
    },
  },
  {
    id: 'eu_footwear_36_46',
    badge: 'EU 36–46',
    nameEn: 'European Footwear Standard (EU 36–46)',
    nameIt: 'Calzature Standard Europeo (EU 36–46)',
    descriptionEn: 'European shoe sizing chart (EU 36 to EU 46) with Mondopoint insole length and standard foot width in centimeters.',
    descriptionIt: 'Scala taglie calzature europee (da EU 36 a EU 46) con lunghezza soletta interna e larghezza pianta del piede in cm.',
    type: 'footwear',
    unit: 'cm',
    sizes: [
      { name: 'EU 36', code: 'EU36', sort: 36 },
      { name: 'EU 37', code: 'EU37', sort: 37 },
      { name: 'EU 38', code: 'EU38', sort: 38 },
      { name: 'EU 39', code: 'EU39', sort: 39 },
      { name: 'EU 40', code: 'EU40', sort: 40 },
      { name: 'EU 41', code: 'EU41', sort: 41 },
      { name: 'EU 42', code: 'EU42', sort: 42 },
      { name: 'EU 43', code: 'EU43', sort: 43 },
      { name: 'EU 44', code: 'EU44', sort: 44 },
      { name: 'EU 45', code: 'EU45', sort: 45 },
      { name: 'EU 46', code: 'EU46', sort: 46 },
    ],
    measurements: [
      { code: 'insole_length', nameEn: 'Insole Length', nameIt: 'Lunghezza Soletta', type: 'length', unit: 'cm' },
      { code: 'foot_width', nameEn: 'Foot Width', nameIt: 'Larghezza Pianta', type: 'width', unit: 'cm' },
    ],
    values: {
      'EU 36': { insole_length: { value: 23.0 }, foot_width: { value: 8.8 } },
      'EU 37': { insole_length: { value: 23.6 }, foot_width: { value: 9.0 } },
      'EU 38': { insole_length: { value: 24.3 }, foot_width: { value: 9.2 } },
      'EU 39': { insole_length: { value: 25.0 }, foot_width: { value: 9.4 } },
      'EU 40': { insole_length: { value: 25.6 }, foot_width: { value: 9.6 } },
      'EU 41': { insole_length: { value: 26.3 }, foot_width: { value: 9.8 } },
      'EU 42': { insole_length: { value: 27.0 }, foot_width: { value: 10.0 } },
      'EU 43': { insole_length: { value: 27.6 }, foot_width: { value: 10.2 } },
      'EU 44': { insole_length: { value: 28.3 }, foot_width: { value: 10.4 } },
      'EU 45': { insole_length: { value: 29.0 }, foot_width: { value: 10.6 } },
      'EU 46': { insole_length: { value: 29.6 }, foot_width: { value: 10.8 } },
    },
  },
];
