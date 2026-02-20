"use client";

import { Input } from "@/components/ui/input";

// Supplement category definitions
export type SupplementCategory = 'protein' | 'pre-workout' | 'hydration' | 'creatine' | 'general';

export interface SupplementProduct {
  // General fields (all categories)
  id: string;
  productName: string;
  sku: string;
  upc?: string;
  brandLine?: string;
  status: 'Draft' | 'Enrichment' | 'Review' | 'Active' | 'Discontinued' | 'Archived';
  
  // Category classification
  category: SupplementCategory;
  productFamily?: string;
  productType?: string;
  
  // General supplement fields
  primaryGoal?: string[];
  keyBenefits?: string;
  targetAudience?: string[];
  usageTiming?: string[];
  
  // Base specifications (common)
  servingSize?: string;
  caloriesPerServing?: number;
  
  // Quality & compliance
  qualityCertifications?: string[];
  dietaryRestrictions?: string[];
  allergenWarnings?: string[];
  
  // Category-specific fields
  proteinFields?: ProteinFields;
  preWorkoutFields?: PreWorkoutFields;
  hydrationFields?: HydrationFields;
  creatineFields?: CreatineFields;
  
  // Business fields
  launchDate?: string;
  msrp?: number;
  costOfGoods?: number;
  marginPercent?: number;
}

export interface ProteinFields {
  proteinContent: number; // grams per serving
  proteinSource: string[]; // Whey Isolate, Concentrate, etc.
  carbsPerServing: number;
  fatPerServing: number;
  sugarPerServing: number;
  bcaaContent?: number; // grams of BCAAs
  aminoAcidProfile?: {
    leucine?: number;
    isoleucine?: number;
    valine?: number;
  };
}

export interface PreWorkoutFields {
  caffeineContent?: number; // mg per serving
  stimulantType: 'high-stim' | 'low-stim' | 'stim-free';
  pumpIngredients?: {
    citrulline?: number; // grams
    arginine?: number; // grams
    betaAlanine?: number; // grams
  };
  focusIngredients?: {
    tyrosine?: number; // mg
    taurine?: number; // mg
  };
  formulationType: 'energy' | 'pump' | 'focus' | 'hybrid';
}

export interface HydrationFields {
  electrolyteProfile: {
    sodium: number; // mg per serving
    potassium: number; // mg
    magnesium: number; // mg
    calcium?: number; // mg
  };
  sugarContent: number; // grams
  hydrationRatio?: string; // e.g., "1 scoop per 16oz water"
  flavorSystem: 'natural' | 'artificial' | 'mixed';
}

export interface CreatineFields {
  creatineContent: number; // grams per serving
  creatineType: 'monohydrate' | 'hcl' | 'buffered' | 'blend';
  purity?: number; // percentage
  loadingPhase?: {
    dosage: number; // grams
    duration: number; // days
  };
  maintenancePhase?: {
    dosage: number; // grams
  };
  additionalIngredients?: string[];
}

// Field configuration for each category
export const categoryFields = {
  protein: {
    name: 'Protein Powder',
    icon: '🥛',
    keyMetrics: ['proteinContent', 'proteinSource', 'bcaaContent'],
    description: 'Protein supplements for muscle building and recovery'
  },
  'pre-workout': {
    name: 'Pre-Workout',
    icon: '⚡',
    keyMetrics: ['caffeineContent', 'formulationType', 'stimulantType'],
    description: 'Performance enhancers for training sessions'
  },
  hydration: {
    name: 'Hydration/Electrolytes',
    icon: '💧',
    keyMetrics: ['sodium', 'potassium', 'electrolyteProfile'],
    description: 'Electrolyte replacement and hydration support'
  },
  creatine: {
    name: 'Creatine',
    icon: '💪',
    keyMetrics: ['creatineContent', 'creatineType', 'purity'],
    description: 'Strength and power enhancement supplements'
  },
  general: {
    name: 'General Supplement',
    icon: '💊',
    keyMetrics: ['servingSize', 'keyBenefits'],
    description: 'Other supplement categories'
  }
};

// Quality certification options
export const qualityCertifications = [
  'Banned Substance Tested',
  'Third-Party Tested',
  'NSF Certified',
  'Informed Sport',
  'cGMP Manufactured',
  'USADA Approved',
  'WADA Compliant'
];

// Dietary restriction options
export const dietaryRestrictions = [
  'Gluten Free',
  'rBST Free', 
  'Lactose Free',
  'Vegan',
  'Vegetarian',
  'Non-GMO',
  'Kosher',
  'Halal',
  'Keto Friendly',
  'Paleo Friendly'
];

// Common allergens
export const commonAllergens = [
  'Milk',
  'Eggs',
  'Peanuts',
  'Tree Nuts',
  'Fish',
  'Shellfish',
  'Soy',
  'Wheat'
];

// Usage timing options
export const usageTiming = [
  'Pre-Workout',
  'Post-Workout',
  'Between Meals',
  'Morning',
  'Evening',
  'During Workout',
  'Before Bed'
];

// Target audience options
export const targetAudience = [
  'Professional Athletes',
  'Gym Enthusiasts', 
  'Weekend Warriors',
  'General Fitness',
  'Endurance Athletes',
  'Strength Athletes',
  'Beginners'
];

// Primary goal options
export const primaryGoals = [
  'Muscle Building',
  'Weight Loss',
  'Recovery',
  'Energy Enhancement',
  'Strength Gains',
  'Endurance',
  'Hydration',
  'Focus/Cognitive'
];
